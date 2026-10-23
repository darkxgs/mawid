import "server-only";
import { and, eq, gt, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { bookings, customers, timeOff, type Booking, type BookingSource, type Business } from "@/db/schema";
import {
  computeDay,
  computeRange,
  occupiedWindow,
  pickStaff,
  type Interval,
  type Rules,
  type StaffInput,
} from "@/lib/availability";
import { addDays, addMinutes, localDate, zonedToUtc, type DateStr } from "@/lib/time";
import { newId, newToken } from "@/lib/id";
import type { Catalog } from "./catalog";
import { BookingError, isOverlapViolation } from "./errors";

const ACTIVE = ["confirmed", "completed"] as const;

export const rulesOf = (b: Business): Rules => ({
  timezone: b.timezone,
  slotIntervalMin: b.slotIntervalMin,
  minNoticeMin: b.minNoticeMin,
  maxAdvanceDays: b.maxAdvanceDays,
});

/** Everything that blocks a staff member's time inside [from, to). */
export async function loadBusy(
  db: DB,
  staffIds: string[],
  from: Date,
  to: Date,
  now: Date,
  excludeBookingId?: string,
): Promise<Map<string, Interval[]>> {
  const busy = new Map<string, Interval[]>(staffIds.map((id) => [id, []]));
  if (!staffIds.length) return busy;
  const [rows, off] = await Promise.all([
    db
      .select({ staffId: bookings.staffId, from: bookings.occupiedFrom, to: bookings.occupiedTo })
      .from(bookings)
      .where(
        and(
          inArray(bookings.staffId, staffIds),
          lt(bookings.occupiedFrom, to),
          gt(bookings.occupiedTo, from),
          or(
            inArray(bookings.status, [...ACTIVE]),
            and(eq(bookings.status, "held"), gt(bookings.holdExpiresAt, now)),
          ),
          excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
        ),
      ),
    db
      .select({ staffId: timeOff.staffId, from: timeOff.startsAt, to: timeOff.endsAt })
      .from(timeOff)
      .where(and(inArray(timeOff.staffId, staffIds), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from))),
  ]);
  for (const r of [...rows, ...off]) {
    busy.get(r.staffId)?.push({ start: r.from.getTime(), end: r.to.getTime() });
  }
  return busy;
}

function eligibleStaff(catalog: Catalog, serviceId: string, staffId?: string | null) {
  return catalog.staff.filter((s) => s.serviceIds.includes(serviceId) && (!staffId || s.id === staffId));
}

async function staffInputs(
  db: DB,
  business: Business,
  catalog: Catalog,
  serviceId: string,
  staffId: string | null | undefined,
  from: DateStr,
  days: number,
  now: Date,
  excludeBookingId?: string,
): Promise<StaffInput[]> {
  const people = eligibleStaff(catalog, serviceId, staffId);
  const start = zonedToUtc(addDays(from, -1), 0, business.timezone);
  const end = zonedToUtc(addDays(from, days + 1), 0, business.timezone);
  const busy = await loadBusy(db, people.map((p) => p.id), start, end, now, excludeBookingId);
  return people.map((p) => ({
    staffId: p.id,
    hours: p.hours.map((h) => ({ weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
    busy: busy.get(p.id) ?? [],
  }));
}

export async function getAvailability(
  db: DB,
  business: Business,
  catalog: Catalog,
  q: { serviceId: string; staffId?: string | null; from: DateStr; days: number; now: Date; excludeBookingId?: string },
) {
  const service = catalog.services.find((s) => s.id === q.serviceId);
  if (!service) throw new BookingError("not_found", "Unknown service");
  const staff = await staffInputs(db, business, catalog, service.id, q.staffId, q.from, q.days, q.now, q.excludeBookingId);
  return computeRange({ from: q.from, days: q.days, rules: rulesOf(business), service, staff, now: q.now });
}

/** Re-check one start time against live data and choose who does it. */
async function resolveSlot(
  db: DB,
  business: Business,
  catalog: Catalog,
  args: { serviceId: string; staffId?: string | null; startsAt: Date; now: Date; rules?: Rules; excludeBookingId?: string },
) {
  const service = catalog.services.find((s) => s.id === args.serviceId);
  if (!service) throw new BookingError("not_found", "Unknown service");
  const date = localDate(args.startsAt, business.timezone);
  const staff = await staffInputs(db, business, catalog, service.id, args.staffId, date, 1, args.now, args.excludeBookingId);
  const day = computeDay({ date, rules: args.rules ?? rulesOf(business), service, staff, now: args.now });
  const slot = day.slots.find((s) => s.start.getTime() === args.startsAt.getTime());
  if (!slot) throw new BookingError("not_available");
  const staffId = args.staffId && slot.staffIds.includes(args.staffId)
    ? args.staffId
    : pickStaff(slot.staffIds, staff, date, business.timezone);
  return { service, staffId };
}

export async function holdSlot(
  db: DB,
  business: Business,
  catalog: Catalog,
  args: {
    serviceId: string;
    staffId?: string | null;
    startsAt: Date;
    locale: "ar" | "en";
    source?: BookingSource;
    now?: Date;
    rules?: Rules;
  },
): Promise<Booking> {
  const now = args.now ?? new Date();
  const { service, staffId } = await resolveSlot(db, business, catalog, { ...args, now });
  const occ = occupiedWindow(args.startsAt, service);
  try {
    return await db.transaction(async (tx) => {
      // Expired holds still sit in the table (and in the exclusion constraint);
      // clear this person's stale ones before claiming the time.
      await tx
        .delete(bookings)
        .where(and(eq(bookings.staffId, staffId), eq(bookings.status, "held"), lte(bookings.holdExpiresAt, now)));
      const [row] = await tx
        .insert(bookings)
        .values({
          id: newId("bk"),
          businessId: business.id,
          serviceId: service.id,
          staffId,
          startsAt: args.startsAt,
          endsAt: addMinutes(args.startsAt, service.durationMin),
          occupiedFrom: new Date(occ.start),
          occupiedTo: new Date(occ.end),
          status: "held",
          source: args.source ?? "web",
          priceMinor: service.priceMinor,
          holdExpiresAt: addMinutes(now, business.holdMinutes),
          manageToken: newToken(),
          locale: args.locale,
        })
        .returning();
      return row;
    });
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("slot_taken");
    throw err;
  }
}

export async function upsertCustomer(
  db: DB,
  businessId: string,
  c: { name: string; phone: string; email?: string | null },
) {
  const [row] = await db
    .insert(customers)
    .values({ id: newId("cus"), businessId, name: c.name, phone: c.phone, email: c.email ?? null })
    .onConflictDoUpdate({
      target: [customers.businessId, customers.phone],
      set: { name: c.name, email: sql`coalesce(excluded.email, ${customers.email})` },
    })
    .returning();
  return row;
}

export async function confirmHold(
  db: DB,
  business: Business,
  args: {
    bookingId: string;
    token: string;
    customer: { name: string; phone: string; email?: string | null };
    notes?: string | null;
  },
): Promise<Booking> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, args.bookingId), eq(bookings.manageToken, args.token), eq(bookings.businessId, business.id)))
    .limit(1);
  // The hold row is deleted only when someone else needs that time. If it is
  // still here, nobody took the slot, so we can confirm it even if late.
  if (!booking) throw new BookingError("hold_expired");
  if (booking.status === "confirmed") return booking;
  if (booking.status !== "held") throw new BookingError("invalid");
  const customer = await upsertCustomer(db, business.id, args.customer);
  const [row] = await db
    .update(bookings)
    .set({ status: "confirmed", customerId: customer.id, holdExpiresAt: null, notes: args.notes ?? null })
    .where(and(eq(bookings.id, booking.id), eq(bookings.status, "held")))
    .returning();
  if (!row) throw new BookingError("hold_expired");
  return row;
}

export async function getBookingByToken(db: DB, token: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.manageToken, token)).limit(1);
  return b ?? null;
}

export function canCustomerChange(booking: Booking, business: Business, now = new Date()) {
  if (booking.status !== "confirmed") return false;
  return booking.startsAt.getTime() - now.getTime() >= business.cancelWindowHours * 3_600_000;
}

export async function cancelBooking(db: DB, bookingId: string) {
  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(bookings.id, bookingId), inArray(bookings.status, ["confirmed", "held"])))
    .returning();
  if (!row) throw new BookingError("invalid");
  return row;
}

export async function rescheduleBooking(
  db: DB,
  business: Business,
  catalog: Catalog,
  booking: Booking,
  args: { startsAt: Date; staffId?: string | null; now?: Date; rules?: Rules },
) {
  const now = args.now ?? new Date();
  const { service, staffId } = await resolveSlot(db, business, catalog, {
    serviceId: booking.serviceId,
    staffId: args.staffId ?? booking.staffId,
    startsAt: args.startsAt,
    now,
    rules: args.rules,
    excludeBookingId: booking.id,
  }).catch(async (e) => {
    // The same person may be busy; fall back to anyone who offers the service.
    if (e instanceof BookingError && e.code === "not_available" && !args.staffId) {
      return resolveSlot(db, business, catalog, {
        serviceId: booking.serviceId,
        startsAt: args.startsAt,
        now,
        rules: args.rules,
        excludeBookingId: booking.id,
      });
    }
    throw e;
  });
  const occ = occupiedWindow(args.startsAt, service);
  try {
    const [row] = await db
      .update(bookings)
      .set({
        staffId,
        startsAt: args.startsAt,
        endsAt: addMinutes(args.startsAt, service.durationMin),
        occupiedFrom: new Date(occ.start),
        occupiedTo: new Date(occ.end),
        reminder24SentAt: null,
        reminder2SentAt: null,
      })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
      .returning();
    if (!row) throw new BookingError("invalid");
    return row;
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("slot_taken");
    throw err;
  }
}

export async function setBookingStatus(
  db: DB,
  businessId: string,
  bookingId: string,
  status: "confirmed" | "completed" | "cancelled" | "no_show",
) {
  try {
    const [row] = await db
      .update(bookings)
      .set({ status, cancelledAt: status === "cancelled" ? new Date() : null })
      .where(and(eq(bookings.id, bookingId), eq(bookings.businessId, businessId), ne(bookings.status, "held")))
      .returning();
    if (!row) throw new BookingError("not_found");
    return row;
  } catch (err) {
    // re-activating a cancelled booking whose time was taken in the meantime
    if (isOverlapViolation(err)) throw new BookingError("slot_taken");
    throw err;
  }
}
