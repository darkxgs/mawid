import { runSweep } from "@/server/jobs";

/**
 * Called by Vercel Cron (see vercel.json) and safe to call from any scheduler.
 * With CRON_SECRET set, an authorised call forces a run; anyone else only gets
 * the throttled run that request traffic would trigger anyway.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorised = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (secret && !authorised) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await runSweep({ force: authorised });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
