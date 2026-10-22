// Runs SQL migrations and tops up demo data. Used by `npm run build` on Vercel,
// so schema changes apply once per deploy instead of on every cold start.
import "dotenv/config";
import postgres from "postgres";
import { databaseUrl, runMigrations } from "../src/db/migrate";

async function main() {
  const url = databaseUrl();
  if (!url) {
    if (process.env.VERCEL) {
      console.warn("[migrate] No database configured yet; skipping. Connect Supabase in Vercel → Storage.");
      return;
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
    const dir = process.env.PGLITE_DIR ?? ".data/pglite";
    (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const client = await PGlite.create(dir, { extensions: { btree_gist } });
    await runMigrations({ kind: "pglite", client });
    await client.close();
    console.log("[migrate] local PGlite database is up to date");
    return;
  }
  // Prefer the direct (non-pooled) connection for DDL when Supabase provides one.
  const direct = process.env.POSTGRES_URL_NON_POOLING || url;
  const client = postgres(direct, { prepare: false, max: 1 });
  try {
    await client`SELECT pg_advisory_lock(7272001)`;
    await runMigrations({ kind: "postgres", client });
    console.log("[migrate] database is up to date");
  } finally {
    await client`SELECT pg_advisory_unlock(7272001)`.catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
