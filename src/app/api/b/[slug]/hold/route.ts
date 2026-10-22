import { z } from "zod";
import { getDb } from "@/db";
import { getBusinessBySlug, getCatalog } from "@/server/catalog";
import { holdSlot } from "@/server/bookings";
import { errorResponse } from "@/server/public";

const Body = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1).nullable().optional(),
  startsAt: z.iso.datetime(),
  locale: z.enum(["ar", "en"]).default("ar"),
});

export async function POST(req: Request, ctx: RouteContext<"/api/b/[slug]/hold">) {
  const { slug } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    const business = await getBusinessBySlug(db, slug);
    if (!business) return Response.json({ error: "not_found" }, { status: 404 });
    const catalog = await getCatalog(db, business);
    const hold = await holdSlot(db, business, catalog, {
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId ?? null,
      startsAt: new Date(parsed.data.startsAt),
      locale: parsed.data.locale,
    });
    return Response.json({
      bookingId: hold.id,
      token: hold.manageToken,
      staffId: hold.staffId,
      expiresAt: hold.holdExpiresAt?.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
