import { z } from "zod";
import { getDb } from "@/db";
import { getBusinessBySlug } from "@/server/catalog";
import { releaseHold } from "@/server/bookings";
import { errorResponse } from "@/server/public";

const Body = z.object({ bookingId: z.string().min(1), token: z.string().min(16) });

export async function POST(req: Request, ctx: RouteContext<"/api/b/[slug]/release">) {
  const { slug } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const db = await getDb();
    const business = await getBusinessBySlug(db, slug);
    if (!business) return Response.json({ error: "not_found" }, { status: 404 });
    await releaseHold(db, business.id, parsed.data.bookingId, parsed.data.token);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
