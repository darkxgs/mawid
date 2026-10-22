import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl, ensureMigrated } from "./migrate";

export { databaseUrl };

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type GlobalDb = { __mawidDb?: Promise<DB> };
const g = globalThis as unknown as GlobalDb;

async function connect(): Promise<DB> {
  const url = databaseUrl();
  if (url) {
    // prepare:false keeps us compatible with transaction-mode poolers
    // (Supabase pgbouncer on :6543).
    const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
    // Production schema changes run once per deploy, in the build step
    // (scripts/migrate.ts), so cold starts never race each other.
    return drizzlePg(client, { schema }) as unknown as DB;
  }
  // Local development without Postgres: an embedded Postgres (PGlite) on disk.
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = await PGlite.create(dir, {
    extensions: { btree_gist },
  });
  await ensureMigrated({ kind: "pglite", client });
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__mawidDb) {
    g.__mawidDb = connect().catch((err) => {
      g.__mawidDb = undefined;
      throw err;
    });
  }
  return g.__mawidDb;
}

export { schema };
