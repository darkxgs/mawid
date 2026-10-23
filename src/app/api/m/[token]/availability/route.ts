import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { getAvailability, getBookingByToken } from "@/server/bookings";
import { errorResponse, serializeDays } from "@/server/public";
import { isDateStr, localDate } from "@/lib/time";

/** Free times for moving an existing booking; its own slot counts as free. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/m/[token]/availability">) {
  const { token } = await ctx.params;
  try {
    const db = await getDb();
    const booking = await getBookingByToken(db, token);
    if (!booking) return Response.json({ error: "not_found" }, { status: 404 });
    const business = (await getBusinessById(db, booking.businessId))!;
    const catalog = await getCatalog(db, business);
    const now = new Date();
    const fromParam = req.nextUrl.searchParams.get("from");
    const from = isDateStr(fromParam) ? fromParam : localDate(now, business.timezone);
    const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 14) || 14, 1), 31);
    const result = await getAvailability(db, business, catalog, {
      serviceId: booking.serviceId,
      from,
      days,
      now,
      excludeBookingId: booking.id,
    });
    return Response.json({ days: serializeDays(result) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
