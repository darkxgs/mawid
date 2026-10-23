// The reminder sweep against a real Postgres engine (PGlite, in memory).
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import type { Connection, DB } from "@/db";
import { runSweep } from "@/server/jobs";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-02T06:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * HOUR);

let conn: Connection;
let db: DB;

async function booking(id: string, startsIn: number, bookedAgo: number, status: schema.BookingStatus = "confirmed") {
  const startsAt = h(startsIn);
  await db.insert(schema.bookings).values({
    id, businessId: "b1", serviceId: "s1", staffId: "a", customerId: "c1",
    startsAt, endsAt: new Date(startsAt.getTime() + 0.5 * HOUR),
    occupiedFrom: startsAt, occupiedTo: new Date(startsAt.getTime() + 0.5 * HOUR),
    status, source: "web", priceMinor: 0, manageToken: `tok_${id}_0000000000000000`, locale: "en",
    createdAt: h(-bookedAgo),
  });
}

beforeAll(async () => {
  process.env.MAWID_SEED_DEMO = "0";
  const client = await PGlite.create({ extensions: { btree_gist } });
  await runMigrations({ kind: "pglite", client }, { seed: false });
  db = drizzle(client, { schema }) as unknown as DB;
  conn = { db, raw: { kind: "pglite", client } };
  await db.insert(schema.users).values({ id: "u1", email: "o@x.com", name: "Owner", passwordHash: "x" });
  await db.insert(schema.businesses).values({ id: "b1", ownerId: "u1", slug: "t", name: "Test", whatsappEnabled: true });
  await db.insert(schema.services).values({ id: "s1", businessId: "b1", name: "Visit", durationMin: 30 });
  await db.insert(schema.staff).values({ id: "a", businessId: "b1", name: "Dr A", position: 0 });
  await db.insert(schema.customers).values({ id: "c1", businessId: "b1", name: "Sam Lee", phone: "+971500000001" });

  await booking("day_ahead", 20, 72); // booked 3 days ago, visit in 20h: gets the 24h reminder
  await booking("soon", 1.5, 48); // visit in 90 min: gets the 2h reminder only
  await booking("last_minute", 1, 2); // booked 2h before a visit 1h away: no reminder
  await booking("same_day", 10, 5); // booked same day: no 24h reminder
  await booking("far", 40, 72); // too early for anything
  await booking("cancelled", 20, 72, "cancelled");
  await booking("unchecked", -14, 72); // ended 13.5h ago, never checked out
  await db.insert(schema.bookings).values({
    id: "stale_hold", businessId: "b1", serviceId: "s1", staffId: "a",
    startsAt: h(60), endsAt: h(60.5), occupiedFrom: h(60), occupiedTo: h(60.5),
    status: "held", source: "web", priceMinor: 0, manageToken: "tok_stale_hold_000000000000000", locale: "en",
    holdExpiresAt: h(-3),
  });
});

describe("reminder sweep", () => {
  it("sends each reminder to the right bookings and tidies up", async () => {
    const r = await runSweep({ conn, now: NOW, force: true });
    expect(r).toEqual({ ran: true, reminders24h: 1, reminders2h: 1, completed: 1, clearedHolds: 1 });

    const sent = await db.select().from(schema.notifications);
    expect(sent.map((n) => `${n.bookingId}:${n.kind}`).sort()).toEqual(["day_ahead:reminder_24h", "soon:reminder_2h"]);
    // No provider credentials in tests, so delivery is recorded as simulated.
    expect(sent.every((n) => n.status === "simulated" && n.channel === "whatsapp")).toBe(true);

    const [unchecked] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, "unchecked"));
    expect(unchecked.status).toBe("completed");
  });

  it("never sends the same reminder twice", async () => {
    const r = await runSweep({ conn, now: NOW, force: true });
    expect(r.reminders24h + r.reminders2h).toBe(0);
    expect(await db.$count(schema.notifications)).toBe(2);
  });

  it("is throttled when not forced", async () => {
    const r = await runSweep({ conn, now: NOW });
    expect(r.ran).toBe(false);
  });
});
