import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getBusinessBySlug } from "@/server/catalog";
import { confirmHold } from "@/server/bookings";
import { notifyBooking } from "@/server/notify";
import { errorResponse } from "@/server/public";
import { currencyCountry, normalizePhone } from "@/lib/phone";

const Body = z.object({
  bookingId: z.string().min(1),
  token: z.string().min(16),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(24),
  email: z.email().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/b/[slug]/confirm">) {
  const { slug } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fields = Object.keys(z.flattenError(parsed.error).fieldErrors);
    return Response.json({ error: "invalid", fields }, { status: 400 });
  }
  try {
    const db = await getDb();
    const business = await getBusinessBySlug(db, slug);
    if (!business) return Response.json({ error: "not_found" }, { status: 404 });
    const phone = normalizePhone(parsed.data.phone, currencyCountry[business.currency] ?? "AE");
    if (!phone) return Response.json({ error: "invalid", fields: ["phone"] }, { status: 400 });
    const booking = await confirmHold(db, business, {
      bookingId: parsed.data.bookingId,
      token: parsed.data.token,
      customer: { name: parsed.data.name, phone, email: parsed.data.email || null },
      notes: parsed.data.notes || null,
    });
    after(() => notifyBooking(db, booking.id, "confirmation"));
    return Response.json({
      manageToken: booking.manageToken,
      startsAt: booking.startsAt.toISOString(),
      staffId: booking.staffId,
      phone,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
