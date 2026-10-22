import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { getBookingByToken, loadBusy, rulesOf } from "@/server/bookings";
import { errorResponse, serializeDays } from "@/server/public";
import { computeRange } from "@/lib/availability";
import { addDays, isDateStr, localDate, zonedToUtc } from "@/lib/time";

/** Free times for moving an existing booking (its own slot counts as free). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/m/[token]/availability">) {
  const { token } = await ctx.params;
  try {
    const db = await getDb();
    const booking = await getBookingByToken(db, token);
    if (!booking) return Response.json({ error: "not_found" }, { status: 404 });
    const business = (await getBusinessById(db, booking.businessId))!;
    const catalog = await getCatalog(db, business);
    const service = catalog.services.find((s) => s.id === booking.serviceId);
    if (!service) return Response.json({ error: "not_found" }, { status: 404 });
    const now = new Date();
    const fromParam = req.nextUrl.searchParams.get("from");
    const from = isDateStr(fromParam) ? fromParam : localDate(now, business.timezone);
    const days = 14;
    const people = catalog.staff.filter((s) => s.serviceIds.includes(service.id));
    const busy = await loadBusy(
      db,
      people.map((p) => p.id),
      zonedToUtc(addDays(from, -1), 0, business.timezone),
      zonedToUtc(addDays(from, days + 1), 0, business.timezone),
      now,
      booking.id,
    );
    const result = computeRange({
      from,
      days,
      rules: rulesOf(business),
      service,
      staff: people.map((p) => ({ staffId: p.id, hours: p.hours, busy: busy.get(p.id) ?? [] })),
      now,
    });
    return Response.json({ days: serializeDays(result) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
