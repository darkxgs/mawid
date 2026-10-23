import type { Sql } from "postgres";
import { getConnection } from "@/db";
import { resetDemo } from "@/db/seed";

export const maxDuration = 300;

/** Nightly, from Vercel Cron (vercel.json): the demo clinic back to its starting state. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const { raw } = await getConnection();
  // One transaction on Postgres, so visitors never see a half-empty clinic.
  if (raw.kind === "postgres") await raw.client.begin((tx) => resetDemo({ kind: "postgres", client: tx as unknown as Sql }));
  else await resetDemo(raw);
  return Response.json({ ok: true, ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
}
