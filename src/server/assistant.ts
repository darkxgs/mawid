import "server-only";
import { and, asc, eq, gte, ilike, inArray, lt, ne, or } from "drizzle-orm";
import type { DB } from "@/db";
import { bookings, customers, type Business } from "@/db/schema";
import { addDays, localDate, localMinutes, minutesToHHMM, zonedToUtc } from "@/lib/time";
import { currencyCountry, normalizePhone } from "@/lib/phone";
import type { Catalog } from "./catalog";
import { cancelBooking, confirmHold, getAvailability, holdSlot, rescheduleBooking, rulesOf } from "./bookings";
import { BookingError, type BookingErrorCode } from "./errors";
import { notifyBooking } from "./notify";

/**
 * What the front-desk assistant can do, bound to one signed-in business. The
 * chat decides which of these to call; every write goes through the same
 * guarded functions as the public booking page.
 */
export type AssistantContext = { db: DB; business: Business; catalog: Catalog; now: Date; defer: (fn: () => Promise<unknown>) => void };

export type FoundBooking = ReturnType<typeof describe>;
export type OpError = BookingErrorCode | "bad_phone";
type Outcome = { ok: true; booking: FoundBooking } | { ok: false; error: OpError };

function describe(
  ctx: AssistantContext,
  b: { id: string; startsAt: Date; endsAt: Date; staffId: string; serviceId: string; status: string; priceMinor?: number },
  customer?: { name: string; phone: string } | null,
) {
  const tz = ctx.business.timezone;
  return {
    bookingId: b.id,
    date: localDate(b.startsAt, tz),
    start: minutesToHHMM(localMinutes(b.startsAt, tz)),
    end: minutesToHHMM(localMinutes(b.endsAt, tz)),
    serviceId: b.serviceId,
    staffId: b.staffId,
    status: b.status as "confirmed" | "completed" | "cancelled" | "no_show" | "held",
    customer: customer ? { name: customer.name, phone: customer.phone } : null,
  };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

export function assistantOps(ctx: AssistantContext) {
  const { db, business, catalog } = ctx;
  const tz = business.timezone;
  // Staff can book at short notice and further ahead than the public page.
  const staffRules = { ...rulesOf(business), minNoticeMin: 0, maxAdvanceDays: 365 };

  async function loadOne(bookingId: string) {
    const [row] = await db
      .select({ b: bookings, c: customers })
      .from(bookings)
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(and(eq(bookings.id, bookingId), eq(bookings.businessId, business.id)));
    return row ?? null;
  }

  return {
    /** Free start times per day, optionally for one person and within a local window. */
    async findFreeTimes(q: { serviceId: string; from: string; days?: number; staffId?: string; between?: { from: string; to: string }; excludeBookingId?: string }) {
      const result = await getAvailability(db, business, catalog, {
        serviceId: q.serviceId,
        staffId: q.staffId ?? null,
        from: q.from,
        days: q.days ?? 1,
        now: ctx.now,
        rules: staffRules,
        excludeBookingId: q.excludeBookingId,
      });
      const lo = q.between ? toMin(q.between.from) : 0;
      const hi = q.between ? toMin(q.between.to) : 24 * 60;
      return result.map((d) => ({
        date: d.date,
        closed: d.closed,
        times: d.slots
          .map((s) => ({ m: localMinutes(s.start, tz), staffIds: s.staffIds }))
          .filter((s) => s.m >= lo && s.m < hi)
          .map((s) => ({ time: minutesToHHMM(s.m), staffIds: s.staffIds })),
      }));
    },

    async listAppointments(q: { date: string; staffId?: string; includeCancelled?: boolean }) {
      const rows = await db
        .select({ b: bookings, c: customers })
        .from(bookings)
        .leftJoin(customers, eq(customers.id, bookings.customerId))
        .where(
          and(
            eq(bookings.businessId, business.id),
            gte(bookings.startsAt, zonedToUtc(q.date, 0, tz)),
            lt(bookings.startsAt, zonedToUtc(addDays(q.date, 1), 0, tz)),
            ne(bookings.status, "held"),
            q.includeCancelled ? undefined : ne(bookings.status, "cancelled"),
            q.staffId ? eq(bookings.staffId, q.staffId) : undefined,
          ),
        )
        .orderBy(asc(bookings.startsAt))
        .limit(80);
      return rows.map((r) => describe(ctx, r.b, r.c));
    },

    async getAppointment(bookingId: string) {
      const row = await loadOne(bookingId);
      return row ? describe(ctx, row.b, row.c) : null;
    },

    /** Customers by part of the name or phone digits, with upcoming and recent visits. */
    async findCustomer(query: string) {
      const digits = query.replace(/\D/g, "");
      const name = query.replace(/[%_\\]/g, "").trim();
      const nameWords = name.split(/\s+/).filter((w) => w.length >= 2);
      if (digits.length < 4 && !nameWords.length) return [];
      const found = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.businessId, business.id),
            digits.length >= 4 ? ilike(customers.phone, `%${digits}%`) : or(...nameWords.map((w) => ilike(customers.name, `%${w}%`))),
          ),
        )
        .limit(20);
      if (!found.length) return [];
      // Prefer people whose name contains every word typed.
      const words = name.toLowerCase().split(/\s+/).filter(Boolean);
      const ranked = digits.length >= 4 ? found : found.filter((c) => words.every((w) => c.name.toLowerCase().includes(w)));
      const people = (ranked.length ? ranked : found).slice(0, 4);
      const rows = await db
        .select()
        .from(bookings)
        .where(and(inArray(bookings.customerId, people.map((c) => c.id)), gte(bookings.startsAt, new Date(ctx.now.getTime() - 90 * 86_400_000)), ne(bookings.status, "held")))
        .orderBy(asc(bookings.startsAt));
      return people.map((c) => {
        const mine = rows.filter((r) => r.customerId === c.id);
        return {
          name: c.name,
          phone: c.phone,
          upcoming: mine.filter((r) => r.startsAt >= ctx.now && r.status === "confirmed").map((r) => describe(ctx, r, c)),
          recent: mine.filter((r) => r.startsAt < ctx.now).slice(-3).reverse().map((r) => describe(ctx, r, c)),
        };
      });
    },

    /** Counts and takings between two local dates, inclusive. */
    async businessStats(q: { from: string; to: string }) {
      const rows = await db
        .select({ status: bookings.status, source: bookings.source, price: bookings.priceMinor, serviceId: bookings.serviceId })
        .from(bookings)
        .where(
          and(
            eq(bookings.businessId, business.id),
            gte(bookings.startsAt, zonedToUtc(q.from, 0, tz)),
            lt(bookings.startsAt, zonedToUtc(addDays(q.to, 1), 0, tz)),
            ne(bookings.status, "held"),
          ),
        );
      const live = rows.filter((r) => r.status !== "cancelled");
      const byService = new Map<string, number>();
      for (const r of live) byService.set(r.serviceId, (byService.get(r.serviceId) ?? 0) + 1);
      return {
        appointments: live.length,
        noShows: rows.filter((r) => r.status === "no_show").length,
        cancelled: rows.filter((r) => r.status === "cancelled").length,
        takingsMinor: live.filter((r) => r.status !== "no_show").reduce((a, r) => a + r.price, 0),
        bookedOnline: live.filter((r) => r.source === "web").length,
        topServices: [...byService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([serviceId, count]) => ({ serviceId, count })),
      };
    },

    async bookAppointment(input: { serviceId: string; date: string; time: string; staffId?: string; name: string; phone: string; language: "ar" | "en"; sendConfirmation?: boolean }): Promise<Outcome> {
      const phone = normalizePhone(input.phone, currencyCountry[business.currency] ?? "AE");
      if (!phone) return { ok: false, error: "bad_phone" };
      try {
        const hold = await holdSlot(db, business, catalog, {
          serviceId: input.serviceId,
          staffId: input.staffId ?? null,
          startsAt: zonedToUtc(input.date, toMin(input.time), tz),
          locale: input.language,
          source: "assistant",
          now: new Date(),
          rules: staffRules,
        });
        const b = await confirmHold(db, business, { bookingId: hold.id, token: hold.manageToken, customer: { name: input.name, phone } });
        if (input.sendConfirmation !== false) ctx.defer(() => notifyBooking(db, b.id, "confirmation"));
        return { ok: true, booking: describe(ctx, b, { name: input.name, phone }) };
      } catch (e) {
        if (e instanceof BookingError) return { ok: false, error: e.code };
        throw e;
      }
    },

    async cancelAppointment(bookingId: string): Promise<Outcome> {
      const row = await loadOne(bookingId);
      if (!row) return { ok: false, error: "not_found" };
      try {
        const b = await cancelBooking(db, row.b.id);
        ctx.defer(() => notifyBooking(db, b.id, "cancellation"));
        return { ok: true, booking: describe(ctx, b, row.c) };
      } catch (e) {
        if (e instanceof BookingError) return { ok: false, error: e.code };
        throw e;
      }
    },

    async moveAppointment(q: { bookingId: string; date: string; time: string; staffId?: string }): Promise<Outcome> {
      const row = await loadOne(q.bookingId);
      if (!row) return { ok: false, error: "not_found" };
      try {
        const b = await rescheduleBooking(db, business, catalog, row.b, {
          startsAt: zonedToUtc(q.date, toMin(q.time), tz),
          staffId: q.staffId ?? null,
          rules: staffRules,
        });
        ctx.defer(() => notifyBooking(db, b.id, "reschedule"));
        return { ok: true, booking: describe(ctx, b, row.c) };
      } catch (e) {
        if (e instanceof BookingError) return { ok: false, error: e.code };
        throw e;
      }
    },
  };
}

export type AssistantOps = ReturnType<typeof assistantOps>;
