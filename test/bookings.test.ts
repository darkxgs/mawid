// Integration tests against a real Postgres engine (PGlite, in memory) with the
// production migrations, so the exclusion constraint is exercised for real.
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import type { DB } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { cancelBooking, confirmHold, getAvailability, holdSlot, rescheduleBooking } from "@/server/bookings";
import { BookingError } from "@/server/errors";
import { zonedToUtc } from "@/lib/time";

const TZ = "Asia/Dubai";
const MONDAY = "2026-11-02";
const NOW = zonedToUtc("2026-11-01", 8 * 60, TZ);
const at = (hhmm: string, date = MONDAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedToUtc(date, h * 60 + m, TZ);
};

let db: DB;

beforeAll(async () => {
  const client = await PGlite.create({ extensions: { btree_gist } });
  await runMigrations({ kind: "pglite", client }, { seed: false });
  db = drizzle(client, { schema }) as unknown as DB;
  await db.insert(schema.users).values({ id: "u1", email: "o@x.com", name: "Owner", passwordHash: "x" });
  await db.insert(schema.businesses).values({
    id: "b1", ownerId: "u1", slug: "test-clinic", name: "Test Clinic", timezone: TZ, slotIntervalMin: 15, minNoticeMin: 0,
  });
  await db.insert(schema.services).values({ id: "s1", businessId: "b1", name: "Check-up", durationMin: 45, bufferAfterMin: 15 });
  await db.insert(schema.staff).values([
    { id: "a", businessId: "b1", name: "Dr A", position: 0 },
    { id: "b", businessId: "b1", name: "Dr B", position: 1 },
  ]);
  await db.insert(schema.staffServices).values([
    { staffId: "a", serviceId: "s1" },
    { staffId: "b", serviceId: "s1" },
  ]);
  await db.insert(schema.workingHours).values([
    { id: "w1", staffId: "a", weekday: 1, startMin: 9 * 60, endMin: 14 * 60 },
    { id: "w2", staffId: "b", weekday: 1, startMin: 9 * 60, endMin: 14 * 60 },
  ]);
});

async function ctx() {
  const business = (await getBusinessById(db, "b1"))!;
  const catalog = await getCatalog(db, business);
  return { business, catalog };
}

describe("booking flow", () => {
  it("holds, confirms and removes the slot from availability", async () => {
    const { business, catalog } = await ctx();
    const hold = await holdSlot(db, business, catalog, { serviceId: "s1", staffId: "a", startsAt: at("09:00"), locale: "en", now: NOW });
    expect(hold.status).toBe("held");
    const confirmed = await confirmHold(db, business, {
      bookingId: hold.id, token: hold.manageToken, customer: { name: "Sam", phone: "+971500000001" },
    });
    expect(confirmed.status).toBe("confirmed");

    const [day] = await getAvailability(db, business, catalog, { serviceId: "s1", staffId: "a", from: MONDAY, days: 1, now: NOW });
    const times = day.slots.map((s) => s.start.getTime());
    expect(times).not.toContain(at("09:00").getTime());
    // 45 min + 15 min buffer blocks until 10:00
    expect(times).not.toContain(at("09:45").getTime());
    expect(times).toContain(at("10:00").getTime());
  });

  it("never double-books under concurrent requests", async () => {
    const { business, catalog } = await ctx();
    const attempt = () =>
      holdSlot(db, business, catalog, { serviceId: "s1", staffId: "b", startsAt: at("10:00"), locale: "en", now: NOW })
        .then(() => "ok")
        .catch((e) => (e instanceof BookingError ? e.code : "crash"));
    const results = await Promise.all([attempt(), attempt(), attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "slot_taken" || r === "not_available")).toHaveLength(4);
  });

  it("gives 'anyone' to the free colleague", async () => {
    const { business, catalog } = await ctx();
    // a is busy 09:00-10:00 (first test), b is busy 10:00-11:00
    const hold = await holdSlot(db, business, catalog, { serviceId: "s1", startsAt: at("09:00"), locale: "en", now: NOW });
    expect(hold.staffId).toBe("b");
  });

  it("lets an expired hold be taken by someone else", async () => {
    const { business, catalog } = await ctx();
    const first = await holdSlot(db, business, catalog, { serviceId: "s1", staffId: "a", startsAt: at("11:00"), locale: "en", now: NOW });
    const later = new Date(NOW.getTime() + 10 * 60_000); // holds last 5 minutes
    const second = await holdSlot(db, business, catalog, { serviceId: "s1", staffId: "a", startsAt: at("11:00"), locale: "en", now: later });
    expect(second.id).not.toBe(first.id);
    await expect(
      confirmHold(db, business, { bookingId: first.id, token: first.manageToken, customer: { name: "Late", phone: "+971500000002" } }),
    ).rejects.toMatchObject({ code: "hold_expired" });
  });

  it("reschedules and cancels", async () => {
    const { business, catalog } = await ctx();
    const hold = await holdSlot(db, business, catalog, { serviceId: "s1", staffId: "a", startsAt: at("10:00"), locale: "en", now: NOW });
    const booking = await confirmHold(db, business, { bookingId: hold.id, token: hold.manageToken, customer: { name: "Rae", phone: "+971500000003" } });
    const moved = await rescheduleBooking(db, business, catalog, booking, { startsAt: at("12:15"), now: NOW });
    expect(moved.startsAt.getTime()).toBe(at("12:15").getTime());
    const cancelled = await cancelBooking(db, moved.id);
    expect(cancelled.status).toBe("cancelled");
    // the time is free again
    const again = await holdSlot(db, business, catalog, { serviceId: "s1", staffId: "a", startsAt: at("12:15"), locale: "en", now: NOW });
    expect(again.status).toBe("held");
  });
});
