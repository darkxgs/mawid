import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { getBusinessBySlug, getCatalog } from "@/server/catalog";
import { getAvailability } from "@/server/bookings";
import { errorResponse, serializeDays } from "@/server/public";
import { isDateStr, localDate } from "@/lib/time";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/b/[slug]/availability">) {
  const { slug } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const serviceId = q.get("service");
  const staffId = q.get("staff") || null;
  const days = Math.min(Math.max(Number(q.get("days") ?? 14) || 14, 1), 31);
  if (!serviceId) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    const business = await getBusinessBySlug(db, slug);
    if (!business) return Response.json({ error: "not_found" }, { status: 404 });
    const now = new Date();
    const fromParam = q.get("from");
    const from = isDateStr(fromParam) ? fromParam : localDate(now, business.timezone);
    const catalog = await getCatalog(db, business);
    const result = await getAvailability(db, business, catalog, { serviceId, staffId, from, days, now });
    return Response.json(
      { days: serializeDays(result) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
