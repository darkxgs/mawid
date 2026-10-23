import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrl, ensureMigrated, type MigrationTarget } from "./migrate";

export { databaseUrl };

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The Drizzle handle plus the raw client underneath it (for raw SQL helpers). */
export type Connection = { db: DB; raw: MigrationTarget };

type GlobalConn = { __mawidConn?: Promise<Connection> };
const g = globalThis as unknown as GlobalConn;

async function connect(): Promise<Connection> {
  const url = databaseUrl();
  if (url) {
    // prepare:false keeps us compatible with transaction-mode poolers
    // (Neon's -pooler host, Supabase on :6543).
    const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
    // Production schema changes run once per deploy, in the build step
    // (scripts/migrate.ts), so cold starts never race each other.
    return { db: drizzlePg(client, { schema }) as unknown as DB, raw: { kind: "postgres", client } };
  }
  // No Postgres configured: an embedded Postgres (PGlite). Locally it lives in
  // .data/; on Vercel (before a database is connected) it lives in /tmp, so a
  // fresh deploy still serves a working, seeded demo.
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "/tmp/mawid-pglite" : ".data/pglite");
  if (process.env.VERCEL) console.warn("[db] No DATABASE_URL: using a temporary embedded database. Connect Postgres for persistence.");
  (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = await PGlite.create(dir, { extensions: { btree_gist } });
  const raw: MigrationTarget = { kind: "pglite", client };
  await ensureMigrated(raw);
  return { db: drizzlePglite(client, { schema }) as unknown as DB, raw };
}

export function getConnection(): Promise<Connection> {
  if (!g.__mawidConn) {
    g.__mawidConn = connect().catch((err) => {
      g.__mawidConn = undefined;
      throw err;
    });
  }
  return g.__mawidConn;
}

export async function getDb(): Promise<DB> {
  return (await getConnection()).db;
}

export { schema };
