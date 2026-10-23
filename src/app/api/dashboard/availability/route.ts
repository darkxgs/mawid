import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { readSession } from "@/server/auth";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { getAvailability, rulesOf } from "@/server/bookings";
import { errorResponse, serializeDays } from "@/server/public";
import { isDateStr } from "@/lib/time";

/** Staff view of free times: no minimum notice, any date ahead. */
export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const serviceId = q.get("service");
  const date = q.get("date");
  if (!serviceId || !isDateStr(date)) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    const business = await getBusinessById(db, session.businessId);
    if (!business || business.ownerId !== session.userId) return Response.json({ error: "unauthorized" }, { status: 401 });
    const catalog = await getCatalog(db, business);
    const days = await getAvailability(db, business, catalog, {
      serviceId,
      staffId: q.get("staff") || null,
      from: date,
      days: 1,
      now: new Date(),
      rules: { ...rulesOf(business), minNoticeMin: 0, maxAdvanceDays: 365 },
    });
    return Response.json({ days: serializeDays(days) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
