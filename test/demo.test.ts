// The demo clinic's nightly reset, and connection strings from Neon/Supabase.
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { cleanPgUrl, runMigrations, type MigrationTarget } from "@/db/migrate";
import { rawQuery } from "@/db/raw";
import { DEMO, resetDemo } from "@/db/seed";

describe("demo reset", () => {
  it("undoes whatever visitors changed, and keeps other accounts", { timeout: 120_000 }, async () => {
    const client = await PGlite.create({ extensions: { btree_gist } });
    const t: MigrationTarget = { kind: "pglite", client };
    const now = new Date("2026-11-02T08:00:00Z");
    await runMigrations(t, { seed: false });
    await resetDemo(t, now); // works on an empty database too
    const count = async () => (await rawQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM bookings WHERE business_id = $1`, [DEMO.businessId]))[0].n;
    const seeded = await count();
    expect(seeded).toBeGreaterThan(1000);

    // A visitor renames the clinic, sends a team member home and cancels everything.
    await rawQuery(t, `UPDATE businesses SET name = 'Vandalised' WHERE id = $1`, [DEMO.businessId]);
    await rawQuery(t, `UPDATE staff SET active = false WHERE business_id = $1`, [DEMO.businessId]);
    await rawQuery(t, `UPDATE bookings SET status = 'cancelled' WHERE business_id = $1`, [DEMO.businessId]);
    // Someone else signs up for a real account.
    await rawQuery(t, `INSERT INTO users (id, email, name, password_hash) VALUES ('u2', 'a@b.c', 'A', 'x')`);
    await rawQuery(t, `INSERT INTO businesses (id, owner_id, slug, name) VALUES ('b2', 'u2', 'mine', 'Mine')`);

    await resetDemo(t, now);
    const [biz] = await rawQuery<{ name: string }>(t, `SELECT name FROM businesses WHERE id = $1`, [DEMO.businessId]);
    expect(biz.name).toBe("Noor Dental Clinic");
    expect((await rawQuery<{ n: number }>(t, `SELECT count(*)::int AS n FROM staff WHERE business_id = $1 AND NOT active`, [DEMO.businessId]))[0].n).toBe(0);
    expect(await count()).toBe(seeded);
    expect((await rawQuery(t, `SELECT id FROM businesses WHERE id = 'b2'`)).length).toBe(1);
    await client.close();
  });
});

describe("connection strings", () => {
  it("drops options postgres.js would send to the server", () => {
    expect(cleanPgUrl("postgresql://u:p@ep-x-pooler.neon.tech/db?channel_binding=require&sslmode=require")).toBe(
      "postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require",
    );
    expect(cleanPgUrl("postgres://u:p@h:6543/db?pgbouncer=true&connect_timeout=15")).toBe("postgres://u:p@h:6543/db?connect_timeout=15");
  });
});
