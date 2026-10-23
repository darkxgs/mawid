import "server-only";
import { tool } from "ai";
import { and, asc, eq, gte, ilike, inArray, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { bookings, customers, type Business } from "@/db/schema";
import { addDays, isDateStr, localDate, localMinutes, minutesToHHMM, weekdayOf, zonedToUtc } from "@/lib/time";
import { currencyCountry, normalizePhone } from "@/lib/phone";
import type { Catalog } from "./catalog";
import { cancelBooking, confirmHold, getAvailability, holdSlot, rescheduleBooking, rulesOf } from "./bookings";
import { BookingError } from "./errors";
import { notifyBooking } from "./notify";

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DateField = z.string().refine(isDateStr, "Use YYYY-MM-DD").describe("Calendar date in the business's time zone, YYYY-MM-DD");
const TimeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
  .describe("Local start time, 24-hour HH:MM");

export type AssistantContext = { db: DB; business: Business; catalog: Catalog; now: Date; defer: (fn: () => Promise<unknown>) => void };

function staffName(ctx: AssistantContext, id: string) {
  return ctx.catalog.staff.find((s) => s.id === id)?.name ?? "Unknown";
}

function describeBooking(ctx: AssistantContext, b: { id: string; startsAt: Date; endsAt: Date; staffId: string; serviceId: string; status: string }, customer?: { name: string; phone: string } | null) {
  const tz = ctx.business.timezone;
  return {
    bookingId: b.id,
    date: localDate(b.startsAt, tz),
    weekday: DAY[weekdayOf(localDate(b.startsAt, tz))],
    start: minutesToHHMM(localMinutes(b.startsAt, tz)),
    end: minutesToHHMM(localMinutes(b.endsAt, tz)),
    service: ctx.catalog.services.find((s) => s.id === b.serviceId)?.name ?? "Unknown service",
    with: staffName(ctx, b.staffId),
    status: b.status,
    customer: customer ? { name: customer.name, phone: customer.phone } : null,
  };
}

const BOOKING_ERROR_TEXT: Record<string, string> = {
  slot_taken: "That time was just taken by someone else.",
  not_available: "That time isn't free (outside working hours, too soon, or already booked).",
  not_found: "Unknown service or booking.",
  invalid: "That change isn't possible for this booking's current status.",
  hold_expired: "That time was taken.",
  too_late: "Too late to change this booking.",
};

/** Tools are bound to one signed-in business; the model can never reach another. */
export function makeTools(ctx: AssistantContext) {
  const tz = ctx.business.timezone;
  const staffRules = { ...rulesOf(ctx.business), minNoticeMin: 0, maxAdvanceDays: 365 };

  return {
    findFreeTimes: tool({
      description:
        "List free start times for a service on one or more days. Use before suggesting or booking any time. Returns times grouped by day with who is free.",
      inputSchema: z.object({
        serviceId: z.string().describe("Service id from the catalog in the system prompt"),
        from: DateField,
        days: z.number().int().min(1).max(14).default(1),
        staffId: z.string().optional().describe("Only this team member"),
        between: z
          .object({ from: TimeField, to: TimeField })
          .optional()
          .describe("Only start times in this local window, e.g. afternoon 12:00 to 17:00"),
      }),
      execute: async ({ serviceId, from, days, staffId, between }) => {
        try {
          const result = await getAvailability(ctx.db, ctx.business, ctx.catalog, { serviceId, staffId: staffId ?? null, from, days, now: ctx.now, rules: staffRules });
          const lo = between ? Number(between.from.slice(0, 2)) * 60 + Number(between.from.slice(3)) : 0;
          const hi = between ? Number(between.to.slice(0, 2)) * 60 + Number(between.to.slice(3)) : 24 * 60;
          return {
            service: ctx.catalog.services.find((s) => s.id === serviceId)?.name,
            days: result.map((d) => ({
              date: d.date,
              weekday: DAY[weekdayOf(d.date)],
              closed: d.closed,
              times: d.slots
                .map((s) => ({ m: localMinutes(s.start, tz), staff: s.staffIds }))
                .filter((s) => s.m >= lo && s.m < hi)
                .slice(0, 16)
                .map((s) => ({ time: minutesToHHMM(s.m), free: s.staff.map((id) => ({ staffId: id, name: staffName(ctx, id) })) })),
            })),
          };
        } catch (e) {
          if (e instanceof BookingError) return { error: BOOKING_ERROR_TEXT[e.code] ?? e.code };
          throw e;
        }
      },
    }),

    listAppointments: tool({
      description: "List appointments on a day, optionally for one team member. Excludes cancelled ones unless asked.",
      inputSchema: z.object({
        date: DateField,
        staffId: z.string().optional(),
        includeCancelled: z.boolean().default(false),
      }),
      execute: async ({ date, staffId, includeCancelled }) => {
        const rows = await ctx.db
          .select({ b: bookings, c: customers })
          .from(bookings)
          .leftJoin(customers, eq(customers.id, bookings.customerId))
          .where(
            and(
              eq(bookings.businessId, ctx.business.id),
              gte(bookings.startsAt, zonedToUtc(date, 0, tz)),
              lt(bookings.startsAt, zonedToUtc(addDays(date, 1), 0, tz)),
              ne(bookings.status, "held"),
              includeCancelled ? undefined : ne(bookings.status, "cancelled"),
              staffId ? eq(bookings.staffId, staffId) : undefined,
            ),
          )
          .orderBy(asc(bookings.startsAt))
          .limit(60);
        return { date, weekday: DAY[weekdayOf(date)], count: rows.length, appointments: rows.map((r) => describeBooking(ctx, r.b, r.c)) };
      },
    }),

    findCustomer: tool({
      description: "Find customers by name or phone and show their upcoming and recent appointments.",
      inputSchema: z.object({ query: z.string().min(2).describe("Part of a name, or phone digits") }),
      execute: async ({ query }) => {
        const digits = query.replace(/\D/g, "");
        const found = await ctx.db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.businessId, ctx.business.id),
              or(ilike(customers.name, `%${query.replace(/[%_]/g, "")}%`), digits.length >= 4 ? ilike(customers.phone, `%${digits}%`) : undefined),
            ),
          )
          .limit(5);
        if (!found.length) return { customers: [] };
        const rows = await ctx.db
          .select()
          .from(bookings)
          .where(and(inArray(bookings.customerId, found.map((c) => c.id)), gte(bookings.startsAt, addDaysUtc(ctx.now, -45)), ne(bookings.status, "held")))
          .orderBy(asc(bookings.startsAt));
        return {
          customers: found.map((c) => {
            const mine = rows.filter((r) => r.customerId === c.id);
            return {
              name: c.name,
              phone: c.phone,
              upcoming: mine.filter((r) => r.startsAt >= ctx.now && r.status === "confirmed").map((r) => describeBooking(ctx, r)),
              recent: mine.filter((r) => r.startsAt < ctx.now).slice(-3).map((r) => describeBooking(ctx, r)),
            };
          }),
        };
      },
    }),

    businessStats: tool({
      description: "Counts and takings between two dates (inclusive): appointments, no-shows, cancellations, online share.",
      inputSchema: z.object({ from: DateField, to: DateField }),
      execute: async ({ from, to }) => {
        const rows = await ctx.db
          .select({ status: bookings.status, source: bookings.source, price: bookings.priceMinor, serviceId: bookings.serviceId })
          .from(bookings)
          .where(
            and(
              eq(bookings.businessId, ctx.business.id),
              gte(bookings.startsAt, zonedToUtc(from, 0, tz)),
              lt(bookings.startsAt, zonedToUtc(addDays(to, 1), 0, tz)),
              ne(bookings.status, "held"),
            ),
          );
        const live = rows.filter((r) => r.status !== "cancelled");
        const byService = new Map<string, number>();
        for (const r of live) byService.set(r.serviceId, (byService.get(r.serviceId) ?? 0) + 1);
        return {
          from,
          to,
          appointments: live.length,
          noShows: rows.filter((r) => r.status === "no_show").length,
          cancelled: rows.filter((r) => r.status === "cancelled").length,
          takings: `${(live.filter((r) => r.status !== "no_show").reduce((a, r) => a + r.price, 0) / 100).toFixed(0)} ${ctx.business.currency}`,
          bookedOnline: live.filter((r) => r.source === "web").length,
          topServices: [...byService.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id, n]) => ({ service: ctx.catalog.services.find((s) => s.id === id)?.name, count: n })),
        };
      },
    }),

    bookAppointment: tool({
      description:
        "Book an appointment for a customer. Only call after findFreeTimes showed the time is free, and with the customer's name and mobile. The owner approves before it runs.",
      inputSchema: z.object({
        serviceId: z.string(),
        date: DateField,
        time: TimeField,
        staffId: z.string().optional().describe("Omit to give it to whoever is free"),
        customerName: z.string().min(2),
        customerPhone: z.string().min(6).describe("Mobile number as given"),
        language: z.enum(["ar", "en"]).default("ar").describe("Language for the customer's WhatsApp messages"),
        sendConfirmation: z.boolean().default(true),
      }),
      execute: async (input) => {
        const phone = normalizePhone(input.customerPhone, currencyCountry[ctx.business.currency] ?? "AE");
        if (!phone) return { ok: false, error: "That phone number doesn't look valid." };
        const [h, m] = input.time.split(":").map(Number);
        try {
          const hold = await holdSlot(ctx.db, ctx.business, ctx.catalog, {
            serviceId: input.serviceId,
            staffId: input.staffId ?? null,
            startsAt: zonedToUtc(input.date, h * 60 + m, tz),
            locale: input.language,
            source: "assistant",
            now: new Date(),
            rules: staffRules,
          });
          const b = await confirmHold(ctx.db, ctx.business, {
            bookingId: hold.id,
            token: hold.manageToken,
            customer: { name: input.customerName, phone },
          });
          if (input.sendConfirmation) ctx.defer(() => notifyBooking(ctx.db, b.id, "confirmation"));
          return { ok: true, booking: describeBooking(ctx, b, { name: input.customerName, phone }) };
        } catch (e) {
          if (e instanceof BookingError) return { ok: false, error: BOOKING_ERROR_TEXT[e.code] ?? e.code };
          throw e;
        }
      },
    }),

    cancelAppointment: tool({
      description: "Cancel a confirmed appointment by its bookingId (from listAppointments or findCustomer). The owner approves first. The customer is notified.",
      inputSchema: z.object({ bookingId: z.string(), summary: z.string().describe("One line describing the appointment, for the approval card") }),
      execute: async ({ bookingId }) => {
        const [b] = await ctx.db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.businessId, ctx.business.id)));
        if (!b) return { ok: false, error: "No such booking." };
        try {
          const row = await cancelBooking(ctx.db, b.id);
          ctx.defer(() => notifyBooking(ctx.db, row.id, "cancellation"));
          return { ok: true, booking: describeBooking(ctx, row) };
        } catch (e) {
          if (e instanceof BookingError) return { ok: false, error: BOOKING_ERROR_TEXT[e.code] ?? e.code };
          throw e;
        }
      },
    }),

    moveAppointment: tool({
      description: "Move a confirmed appointment to a new date and time. Check findFreeTimes first. The owner approves first. The customer is notified.",
      inputSchema: z.object({
        bookingId: z.string(),
        date: DateField,
        time: TimeField,
        staffId: z.string().optional(),
        summary: z.string().describe("One line: who, what, from when to when, for the approval card"),
      }),
      execute: async ({ bookingId, date, time, staffId }) => {
        const [b] = await ctx.db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.businessId, ctx.business.id)));
        if (!b) return { ok: false, error: "No such booking." };
        const [h, m] = time.split(":").map(Number);
        try {
          const row = await rescheduleBooking(ctx.db, ctx.business, ctx.catalog, b, {
            startsAt: zonedToUtc(date, h * 60 + m, tz),
            staffId: staffId ?? null,
            rules: staffRules,
          });
          ctx.defer(() => notifyBooking(ctx.db, row.id, "reschedule"));
          return { ok: true, booking: describeBooking(ctx, row) };
        } catch (e) {
          if (e instanceof BookingError) return { ok: false, error: BOOKING_ERROR_TEXT[e.code] ?? e.code };
          throw e;
        }
      },
    }),
  };
}

export type AssistantTools = ReturnType<typeof makeTools>;

function addDaysUtc(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}

export function systemPrompt(ctx: AssistantContext) {
  const tz = ctx.business.timezone;
  const today = localDate(ctx.now, tz);
  const calendar = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i);
    return `${d} ${DAY[weekdayOf(d)]}${i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : ""}`;
  }).join("\n");
  const svc = ctx.catalog.services
    .filter((s) => s.active)
    .map((s) => `- ${s.id}: ${s.name}${s.nameAr ? ` / ${s.nameAr}` : ""}, ${s.durationMin} min, ${(s.priceMinor / 100).toFixed(0)} ${ctx.business.currency}`)
    .join("\n");
  const team = ctx.catalog.staff
    .filter((s) => s.active)
    .map((s) => `- ${s.id}: ${s.name}${s.title ? ` (${s.title})` : ""}; does ${s.serviceIds.map((id) => ctx.catalog.services.find((x) => x.id === id)?.name).filter(Boolean).join(", ")}`)
    .join("\n");

  return `You are the front-desk assistant inside Mawid for ${ctx.business.name}, used by the owner and reception staff (not by customers).
Now: ${today} ${minutesToHHMM(localMinutes(ctx.now, tz))} local time (${tz}).

Next 14 days:
${calendar}

Services (id: name, length, price):
${svc}

Team (id: name; services):
${team}

How to work:
- Answer from tools, never from memory. Look up free times before proposing or booking; look up the customer before cancelling or moving.
- Resolve "tomorrow", "Thursday", "next week" with the calendar above. Times are local, 24-hour.
- To book you need the service, a free time, the customer's name and mobile. If something is missing, ask for just that.
- Booking, cancelling and moving show the owner an approval card; call the tool directly instead of asking "shall I?" in text.
- Keep replies short and scannable. Use the staff member's name, not their id. Never show ids.
- Reply in the language the user writes in (Arabic or English).
- You can't change prices, hours or services; say where in the dashboard to do it.`;
}

