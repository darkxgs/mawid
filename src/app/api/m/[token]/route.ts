import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { canCustomerChange, cancelBooking, getBookingByToken, rescheduleBooking } from "@/server/bookings";
import { notifyBooking } from "@/server/notify";
import { errorResponse } from "@/server/public";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("reschedule"), startsAt: z.iso.datetime() }),
]);

export async function POST(req: Request, ctx: RouteContext<"/api/m/[token]">) {
  const { token } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    const booking = await getBookingByToken(db, token);
    if (!booking) return Response.json({ error: "not_found" }, { status: 404 });
    const business = (await getBusinessById(db, booking.businessId))!;
    if (!canCustomerChange(booking, business)) return Response.json({ error: "too_late" }, { status: 409 });

    if (parsed.data.action === "cancel") {
      const row = await cancelBooking(db, booking.id);
      after(() => notifyBooking(db, row.id, "cancellation"));
      return Response.json({ status: row.status });
    }
    const catalog = await getCatalog(db, business);
    const row = await rescheduleBooking(db, business, catalog, booking, { startsAt: new Date(parsed.data.startsAt) });
    after(() => notifyBooking(db, row.id, "reschedule"));
    return Response.json({ status: row.status, startsAt: row.startsAt.toISOString(), staffId: row.staffId });
  } catch (err) {
    return errorResponse(err);
  }
}
