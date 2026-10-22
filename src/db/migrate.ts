// Tiny SQL-file migrator shared by the app, the CLI script and the tests.
// It works with both postgres-js (production) and PGlite (local + tests).
import type { Sql } from "postgres";
import type { PGlite } from "@electric-sql/pglite";
import { seedDemo } from "./seed";
import { rawExec as exec, rawQuery as query } from "./raw";
import { migrations } from "./migrations";

export type MigrationTarget =
  | { kind: "postgres"; client: Sql }
  | { kind: "pglite"; client: PGlite };

export function databaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    undefined
  );
}

let migrated: Promise<void> | undefined;

export function ensureMigrated(target: MigrationTarget): Promise<void> {
  if (!migrated) migrated = runMigrations(target);
  return migrated;
}

export async function runMigrations(target: MigrationTarget, opts: { seed?: boolean } = {}) {
  await exec(
    target,
    `CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set(
    (await query<{ name: string }>(target, `SELECT name FROM _migrations`)).map((r) => r.name),
  );
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    await exec(target, `BEGIN;\n${m.sql}\nINSERT INTO _migrations(name) VALUES ('${m.name}');\nCOMMIT;`);
  }
  if (opts.seed !== false && process.env.MAWID_SEED_DEMO !== "0") {
    await seedDemo(target);
  }
}
