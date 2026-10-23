// The assistant's lookups and writes, against a real Postgres engine (PGlite),
// and the ready replies built on top of them.
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import type { DB } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { assistantOps, type AssistantContext } from "@/server/assistant";
import { respond } from "@/server/assistant-replies";
import { zonedToUtc } from "@/lib/time";

const TZ = "Asia/Dubai";
const MONDAY = "2026-11-02";
const NOW = zonedToUtc("2026-11-01", 8 * 60, TZ);
let db: DB;
let ctx: AssistantContext;
const deferred: (() => Promise<unknown>)[] = [];

beforeAll(async () => {
  const client = await PGlite.create({ extensions: { btree_gist } });
  await runMigrations({ kind: "pglite", client }, { seed: false });
  db = drizzle(client, { schema }) as unknown as DB;
  await db.insert(schema.users).values({ id: "u1", email: "o@x.com", name: "Owner", passwordHash: "x" });
  await db.insert(schema.businesses).values({ id: "b1", ownerId: "u1", slug: "t", name: "Test Clinic", timezone: TZ, minNoticeMin: 0 });
  await db.insert(schema.services).values({ id: "s1", businessId: "b1", name: "Check-up", nameAr: "فحص", durationMin: 30, priceMinor: 20000 });
  await db.insert(schema.staff).values({ id: "a", businessId: "b1", name: "Dr A", position: 0 });
  await db.insert(schema.staffServices).values({ staffId: "a", serviceId: "s1" });
  await db.insert(schema.workingHours).values({ id: "w1", staffId: "a", weekday: 1, startMin: 9 * 60, endMin: 12 * 60 });
  const business = (await getBusinessById(db, "b1"))!;
  ctx = { db, business, catalog: await getCatalog(db, business), now: NOW, defer: (fn) => void deferred.push(fn) };
});

describe("assistant operations", () => {
  it("finds free times inside a window", async () => {
    const [day] = await assistantOps(ctx).findFreeTimes({ serviceId: "s1", from: MONDAY, between: { from: "10:00", to: "11:00" } });
    expect(day.times.map((t) => t.time)).toEqual(["10:00", "10:15", "10:30", "10:45"]);
  });

  it("books, refuses the same time twice, then moves and cancels", async () => {
    const ops = assistantOps(ctx);
    const first = await ops.bookAppointment({ serviceId: "s1", date: MONDAY, time: "10:00", name: "Sam Lee", phone: "050 111 2222", language: "en" });
    expect(first.ok).toBe(true);
    expect(deferred).toHaveLength(1);

    const again = await ops.bookAppointment({ serviceId: "s1", date: MONDAY, time: "10:15", name: "Ana", phone: "050 333 4444", language: "en", sendConfirmation: false });
    expect(again.ok).toBe(false);

    const id = first.ok ? first.booking.bookingId : "";
    const moved = await ops.moveAppointment({ bookingId: id, date: MONDAY, time: "11:00" });
    expect(moved.ok && moved.booking.start).toBe("11:00");
    expect((await ops.listAppointments({ date: MONDAY })).map((a) => a.start)).toEqual(["11:00"]);

    expect((await ops.cancelAppointment(id)).ok).toBe(true);
    const stats = await ops.businessStats({ from: MONDAY, to: MONDAY });
    expect(stats.appointments).toBe(0);
    expect(stats.cancelled).toBe(1);
  });

  it("finds customers by phone digits or name", async () => {
    const ops = assistantOps(ctx);
    expect((await ops.findCustomer("1112222"))[0]?.name).toBe("Sam Lee");
    expect((await ops.findCustomer("sam"))[0]?.name).toBe("Sam Lee");
    expect(await ops.findCustomer("x")).toEqual([]);
  });

  it("never reaches another business's bookings", async () => {
    expect(await assistantOps(ctx).getAppointment("not-ours")).toBeNull();
    expect((await assistantOps(ctx).cancelAppointment("not-ours")).ok).toBe(false);
  });
});

describe("ready replies", () => {
  it("asks for the service before showing free times", async () => {
    const r = await respond(ctx, { t: "free", date: MONDAY }, "en");
    expect(r.text).toBe("Free times for which service?");
    expect(r.chips.map((c) => c.label)).toEqual(["Check-up"]);
  });

  it("answers a typed question with tappable times that lead to a booking", async () => {
    const r = await respond(ctx, { t: "text", text: "Any free check-up slots on Monday morning?" }, "en");
    expect(r.text).toMatch(/^Check-up, tomorrow morning: \d+ free times\. The earliest is 09:00 with Dr A\.$/);
    const block = r.blocks[0];
    expect(block.kind).toBe("times");
    const tap = block.kind === "times" ? block.days[0].times[0].step : undefined;
    expect(tap).toMatchObject({ t: "book", serviceId: "s1", date: MONDAY, time: "09:00", staffId: "a" });

    // Tapping it asks who the visit is for, then shows a card to confirm.
    const who = await respond(ctx, tap!, "en");
    expect(who.blocks[0].kind).toBe("contact");
    const check = await respond(ctx, { t: "book", serviceId: "s1", date: MONDAY, time: "09:00", staffId: "a", name: "Mona Ali", phone: "050 555 6666", msgLang: "ar" }, "en");
    const card = check.blocks[0];
    expect(card.kind).toBe("confirm");
    if (card.kind !== "confirm") return;
    expect(card.yes.step).toMatchObject({ t: "book.confirm", phone: "+971505556666", msgLang: "ar" });

    // Nothing is written until the confirm step runs.
    expect((await assistantOps(ctx).listAppointments({ date: MONDAY })).length).toBe(0);
    const done = await respond(ctx, card.yes.step, "en");
    expect(done.blocks[0]).toMatchObject({ kind: "done", title: "Booked" });
    expect((await assistantOps(ctx).listAppointments({ date: MONDAY })).map((a) => a.start)).toEqual(["09:00"]);
  });

  it("replies in Arabic to an Arabic question", async () => {
    const r = await respond(ctx, { t: "text", text: "مين عنده مواعيد بكرة الصبح؟" }, "ar");
    expect(r.lang).toBe("ar");
    expect(r.text).toContain("غدًا صباحًا");
    expect(r.text).toContain("موعد واحد");
  });

  it("goes straight to the confirm card when one visit matches a cancel request", async () => {
    const r = await respond(ctx, { t: "text", text: "Cancel Mona Ali's appointment" }, "en");
    expect(r.blocks[0]).toMatchObject({ kind: "confirm", tone: "cancel" });
  });

  it("admits when it doesn't understand", async () => {
    const r = await respond(ctx, { t: "text", text: "sing me a song" }, "en");
    expect(r.text).toMatch(/^I didn't catch that/);
    expect(r.chips.length).toBeGreaterThan(3);
  });
});
