import "server-only";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, lt, ne, or, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import { getConnection } from "@/db";
import { rawQuery } from "@/db/raw";
import {
  bookings,
  customers,
  notifications,
  services,
  timeOff,
  type BookingStatus,
  type Business,
} from "@/db/schema";
import { addDays, localDate, localMinutes, weekdayOf, zonedToUtc, type DateStr } from "@/lib/time";
import type { Catalog } from "./catalog";

/* ------------------------------------------------------------------ */
/* Shared booking row                                                  */
/* ------------------------------------------------------------------ */

const bookingSelect = {
  id: bookings.id,
  staffId: bookings.staffId,
  serviceId: bookings.serviceId,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  status: bookings.status,
  source: bookings.source,
  priceMinor: bookings.priceMinor,
  notes: bookings.notes,
  locale: bookings.locale,
  manageToken: bookings.manageToken,
  createdAt: bookings.createdAt,
  holdExpiresAt: bookings.holdExpiresAt,
  customerId: customers.id,
  customerName: customers.name,
  customerPhone: customers.phone,
  customerEmail: customers.email,
  serviceName: services.name,
  serviceNameAr: services.nameAr,
};

type BookingRowRaw = Awaited<ReturnType<typeof baseQuery>>[number];

function baseQuery(db: DB, where: SQL | undefined) {
  return db
    .select(bookingSelect)
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(customers, eq(customers.id, bookings.customerId))
    .where(where);
}

export function serializeBooking(r: BookingRowRaw, tz: string) {
  return {
    id: r.id,
    staffId: r.staffId,
    serviceId: r.serviceId,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    startMin: localMinutes(r.startsAt, tz),
    endMin: localMinutes(r.endsAt, tz) || 24 * 60,
    date: localDate(r.startsAt, tz),
    status: r.status,
    source: r.source,
    priceMinor: r.priceMinor,
    notes: r.notes,
    locale: r.locale,
    manageToken: r.manageToken,
    createdAt: r.createdAt.toISOString(),
    customer: r.customerId ? { id: r.customerId, name: r.customerName!, phone: r.customerPhone!, email: r.customerEmail } : null,
    service: { name: r.serviceName, nameAr: r.serviceNameAr },
  };
}
export type DashBooking = ReturnType<typeof serializeBooking>;

/* ------------------------------------------------------------------ */
/* Today / day schedule                                                */
/* ------------------------------------------------------------------ */

export async function getDaySchedule(db: DB, business: Business, catalog: Catalog, date: DateStr, now: Date) {
  const tz = business.timezone;
  const from = zonedToUtc(date, 0, tz);
  const to = zonedToUtc(addDays(date, 1), 0, tz);
  const staffIds = catalog.staff.map((s) => s.id);

  const [rows, off] = await Promise.all([
    baseQuery(
      db,
      and(
        eq(bookings.businessId, business.id),
        gte(bookings.startsAt, from),
        lt(bookings.startsAt, to),
        or(ne(bookings.status, "held"), gt(bookings.holdExpiresAt, now)),
      ),
    ).orderBy(asc(bookings.startsAt)),
    staffIds.length
      ? db
          .select()
          .from(timeOff)
          .where(and(inArray(timeOff.staffId, staffIds), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from)))
      : Promise.resolve([]),
  ]);

  const list = rows.map((r) => serializeBooking(r, tz));
  const notes = list.length
    ? await db
        .select()
        .from(notifications)
        .where(inArray(notifications.bookingId, list.map((b) => b.id)))
        .orderBy(asc(notifications.createdAt))
    : [];
  const byBooking = new Map<string, typeof notes>();
  for (const n of notes) {
    if (!byBooking.has(n.bookingId!)) byBooking.set(n.bookingId!, []);
    byBooking.get(n.bookingId!)!.push(n);
  }

  const wd = weekdayOf(date);
  const team = catalog.staff.map((s) => {
    const hours = s.hours.filter((h) => h.weekday === wd).map((h) => ({ startMin: h.startMin, endMin: h.endMin }));
    const away = off
      .filter((o) => o.staffId === s.id)
      .map((o) => ({
        startMin: o.startsAt <= from ? 0 : localMinutes(o.startsAt, tz),
        endMin: o.endsAt >= to ? 24 * 60 : localMinutes(o.endsAt, tz),
        reason: o.reason,
      }));
    return {
      id: s.id,
      name: s.name,
      nameAr: s.nameAr,
      title: s.title,
      color: s.color,
      hours,
      away,
    };
  });

  const live = list.filter((b) => b.status !== "cancelled" && b.status !== "held");
  const capacityMin = team.reduce((sum, s) => sum + s.hours.reduce((a, h) => a + (h.endMin - h.startMin), 0), 0);
  const bookedMin = live.reduce((sum, b) => sum + (b.endMin - b.startMin), 0);

  return {
    date,
    today: localDate(now, tz),
    nowMin: localMinutes(now, tz),
    staff: team.filter((s) => s.hours.length || list.some((b) => b.staffId === s.id)),
    offToday: team.filter((s) => !s.hours.length && !list.some((b) => b.staffId === s.id)).map((s) => s.id),
    bookings: list.map((b) => ({
      ...b,
      messages: (byBooking.get(b.id) ?? []).map((n) => ({
        id: n.id,
        kind: n.kind,
        channel: n.channel,
        status: n.status,
        createdAt: n.createdAt.toISOString(),
      })),
    })),
    stats: {
      booked: live.length,
      revenueMinor: live.filter((b) => b.status !== "no_show").reduce((s, b) => s + b.priceMinor, 0),
      utilisation: capacityMin ? bookedMin / capacityMin : 0,
      freeMin: Math.max(0, capacityMin - bookedMin),
      noShows: list.filter((b) => b.status === "no_show").length,
      cancelled: list.filter((b) => b.status === "cancelled").length,
      online: live.filter((b) => b.source === "web").length,
    },
  };
}
export type DaySchedule = Awaited<ReturnType<typeof getDaySchedule>>;
export type ScheduleBooking = DaySchedule["bookings"][number];

/** Visits that ended but nobody marked as attended or missed. */
export async function getNeedsCheckout(db: DB, business: Business, now: Date) {
  const rows = await baseQuery(
    db,
    and(
      eq(bookings.businessId, business.id),
      eq(bookings.status, "confirmed"),
      lt(bookings.endsAt, now),
      gte(bookings.startsAt, new Date(now.getTime() - 3 * 86_400_000)),
    ),
  )
    .orderBy(desc(bookings.startsAt))
    .limit(8);
  return rows.map((r) => serializeBooking(r, business.timezone));
}

/* ------------------------------------------------------------------ */
/* Bookings list                                                       */
/* ------------------------------------------------------------------ */

export type BookingFilters = {
  scope: "upcoming" | "past" | "all";
  status?: BookingStatus | null;
  staffId?: string | null;
  q?: string | null;
  page: number;
};

export const PAGE_SIZE = 40;

export async function listBookings(db: DB, business: Business, f: BookingFilters, now: Date) {
  const conds: (SQL | undefined)[] = [eq(bookings.businessId, business.id), ne(bookings.status, "held")];
  if (f.scope === "upcoming") conds.push(gte(bookings.startsAt, now));
  if (f.scope === "past") conds.push(lt(bookings.startsAt, now));
  if (f.status) conds.push(eq(bookings.status, f.status));
  if (f.staffId) conds.push(eq(bookings.staffId, f.staffId));
  if (f.q?.trim()) {
    const q = `%${f.q.trim().replace(/[%_]/g, "\\$&")}%`;
    const digits = f.q.replace(/\D/g, "");
    conds.push(or(ilike(customers.name, q), digits.length >= 3 ? ilike(customers.phone, `%${digits}%`) : undefined));
  }
  const where = and(...conds);
  const [rows, [{ total }]] = await Promise.all([
    baseQuery(db, where)
      .orderBy(f.scope === "upcoming" ? asc(bookings.startsAt) : desc(bookings.startsAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(bookings)
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(where),
  ]);
  return { rows: rows.map((r) => serializeBooking(r, business.timezone)), total };
}

export async function getBookingMessages(db: DB, businessId: string, bookingId: string) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.businessId, businessId), eq(notifications.bookingId, bookingId)))
    .orderBy(asc(notifications.createdAt));
  return rows.map((n) => ({ id: n.id, kind: n.kind, channel: n.channel, status: n.status, createdAt: n.createdAt.toISOString() }));
}

/* ------------------------------------------------------------------ */
/* Messages outbox                                                     */
/* ------------------------------------------------------------------ */

export async function listMessages(db: DB, business: Business, opts: { kind?: string | null; page: number }) {
  const where = and(eq(notifications.businessId, business.id), opts.kind ? eq(notifications.kind, opts.kind as never) : undefined);
  const [rows, [{ total }], breakdown] = await Promise.all([
    db
      .select({
        n: notifications,
        customerName: customers.name,
        startsAt: bookings.startsAt,
      })
      .from(notifications)
      .leftJoin(bookings, eq(bookings.id, notifications.bookingId))
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(PAGE_SIZE)
      .offset((opts.page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(notifications).where(where),
    db
      .select({ status: notifications.status, n: count() })
      .from(notifications)
      .where(and(eq(notifications.businessId, business.id), gte(notifications.createdAt, new Date(Date.now() - 7 * 86_400_000))))
      .groupBy(notifications.status),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.n.id,
      bookingId: r.n.bookingId,
      channel: r.n.channel,
      kind: r.n.kind,
      recipient: r.n.recipient,
      body: r.n.body,
      status: r.n.status,
      error: r.n.error,
      createdAt: r.n.createdAt.toISOString(),
      customerName: r.customerName,
      startsAt: r.startsAt?.toISOString() ?? null,
    })),
    total,
    week: Object.fromEntries(breakdown.map((b) => [b.status, b.n])) as Partial<Record<"sent" | "failed" | "simulated", number>>,
  };
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

export async function getInsights(business: Business, catalog: Catalog, now: Date, days = 28) {
  const { raw } = await getConnection();
  const tz = business.timezone;
  const today = localDate(now, tz);
  const first = addDays(today, -(days - 1));
  const from = zonedToUtc(first, 0, tz);
  const to = zonedToUtc(addDays(today, 1), 0, tz);
  const prevFrom = zonedToUtc(addDays(first, -days), 0, tz);
  const p = [business.id, from.toISOString(), to.toISOString(), tz];
  const p3 = p.slice(0, 3);

  const [daily, heat, sources, top, perStaff, leads, prev] = await Promise.all([
    rawQuery<{ d: string; booked: number; revenue: number; no_show: number; cancelled: number }>(
      raw,
      `SELECT to_char(starts_at AT TIME ZONE $4, 'YYYY-MM-DD') AS d,
              count(*) FILTER (WHERE status IN ('confirmed','completed','no_show'))::int AS booked,
              coalesce(sum(price_minor) FILTER (WHERE status IN ('completed','confirmed')), 0)::int AS revenue,
              count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM bookings WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status <> 'held'
        GROUP BY 1 ORDER BY 1`,
      p,
    ),
    rawQuery<{ wd: number; hr: number; n: number }>(
      raw,
      `SELECT extract(dow FROM starts_at AT TIME ZONE $4)::int AS wd, extract(hour FROM starts_at AT TIME ZONE $4)::int AS hr, count(*)::int AS n
         FROM bookings WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status IN ('confirmed','completed','no_show')
        GROUP BY 1, 2`,
      p,
    ),
    rawQuery<{ source: string; n: number }>(
      raw,
      `SELECT source, count(*)::int AS n FROM bookings
        WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status IN ('confirmed','completed','no_show')
        GROUP BY 1`,
      p3,
    ),
    rawQuery<{ service_id: string; n: number; revenue: number }>(
      raw,
      `SELECT service_id, count(*)::int AS n, coalesce(sum(price_minor) FILTER (WHERE status IN ('completed','confirmed')),0)::int AS revenue
         FROM bookings WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status IN ('confirmed','completed','no_show')
        GROUP BY 1 ORDER BY 2 DESC`,
      p3,
    ),
    rawQuery<{ staff_id: string; minutes: number; n: number }>(
      raw,
      `SELECT staff_id, coalesce(sum(extract(epoch FROM ends_at - starts_at) / 60), 0)::int AS minutes, count(*)::int AS n
         FROM bookings WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status IN ('confirmed','completed','no_show')
        GROUP BY 1`,
      p3,
    ),
    rawQuery<{ lead_hours: number; returning: number; total: number }>(
      raw,
      `WITH b AS (
         SELECT customer_id, starts_at, created_at FROM bookings
          WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status IN ('confirmed','completed','no_show')
       )
       SELECT coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM starts_at - created_at) / 3600), 0)::float AS lead_hours,
              (SELECT count(DISTINCT b.customer_id) FROM b WHERE EXISTS (
                 SELECT 1 FROM bookings o WHERE o.customer_id = b.customer_id AND o.business_id = $1 AND o.starts_at < b.starts_at AND o.status IN ('completed','confirmed','no_show')
               ))::int AS returning,
              (SELECT count(DISTINCT customer_id) FROM b)::int AS total
         FROM b`,
      p3,
    ),
    rawQuery<{ booked: number; revenue: number; no_show: number }>(
      raw,
      `SELECT count(*) FILTER (WHERE status IN ('confirmed','completed','no_show'))::int AS booked,
              coalesce(sum(price_minor) FILTER (WHERE status IN ('completed','confirmed')), 0)::int AS revenue,
              count(*) FILTER (WHERE status = 'no_show')::int AS no_show
         FROM bookings WHERE business_id = $1 AND starts_at >= $2 AND starts_at < $3 AND status <> 'held'`,
      [business.id, prevFrom.toISOString(), from.toISOString()],
    ),
  ]);

  // Capacity per staff member over the window, from weekly hours (time off ignored).
  const capacity = new Map<string, number>();
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const s of catalog.staff) {
      const mins = s.hours.filter((h) => h.weekday === wd).reduce((a, h) => a + h.endMin - h.startMin, 0);
      capacity.set(s.id, (capacity.get(s.id) ?? 0) + mins);
    }
  }

  const byDay = new Map(daily.map((r) => [r.d, r]));
  const series = [];
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const r = byDay.get(d);
    series.push({ date: d, booked: r?.booked ?? 0, revenue: r?.revenue ?? 0, noShow: r?.no_show ?? 0, cancelled: r?.cancelled ?? 0 });
  }
  const totals = series.reduce(
    (a, r) => ({ booked: a.booked + r.booked, revenue: a.revenue + r.revenue, noShow: a.noShow + r.noShow, cancelled: a.cancelled + r.cancelled }),
    { booked: 0, revenue: 0, noShow: 0, cancelled: 0 },
  );
  const sourceTotal = sources.reduce((a, s) => a + s.n, 0);
  const serviceName = new Map(catalog.services.map((s) => [s.id, s]));

  return {
    days,
    first,
    today,
    series,
    totals,
    previous: { booked: prev[0]?.booked ?? 0, revenue: prev[0]?.revenue ?? 0, noShow: prev[0]?.no_show ?? 0 },
    noShowRate: totals.booked ? totals.noShow / totals.booked : 0,
    prevNoShowRate: prev[0]?.booked ? prev[0].no_show / prev[0].booked : 0,
    onlineShare: sourceTotal ? (sources.find((s) => s.source === "web")?.n ?? 0) / sourceTotal : 0,
    sources: sources.map((s) => ({ source: s.source, n: s.n })),
    heat: heat.map((h) => ({ weekday: h.wd, hour: h.hr, n: h.n })),
    topServices: top.map((t) => ({
      id: t.service_id,
      name: serviceName.get(t.service_id)?.name ?? "Removed service",
      n: t.n,
      revenue: t.revenue,
    })),
    staff: catalog.staff.map((s) => {
      const row = perStaff.find((r) => r.staff_id === s.id);
      const cap = capacity.get(s.id) ?? 0;
      return { id: s.id, name: s.name, color: s.color, n: row?.n ?? 0, utilisation: cap ? (row?.minutes ?? 0) / cap : 0 };
    }),
    medianLeadHours: leads[0]?.lead_hours ?? 0,
    returningShare: leads[0]?.total ? leads[0].returning / leads[0].total : 0,
  };
}
export type Insights = Awaited<ReturnType<typeof getInsights>>;

