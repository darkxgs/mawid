// The assistant's tools run against a real Postgres engine (PGlite). The model
// is not involved here: these are the functions it can call.
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import type { DB } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { makeTools, systemPrompt, type AssistantContext } from "@/server/assistant";
import { zonedToUtc } from "@/lib/time";

const TZ = "Asia/Dubai";
const MONDAY = "2026-11-02";
const NOW = zonedToUtc("2026-11-01", 8 * 60, TZ);
let db: DB;
let ctx: AssistantContext;
const deferred: (() => Promise<unknown>)[] = [];
// Tools here are plain async functions (not streaming), so the result is the output itself.
type Exec<I, O> = { execute?: (input: I, opts: never) => PromiseLike<O> | O | AsyncIterable<O> };
const run = async <I, O>(t: Exec<I, O>, input: I): Promise<O> => (await t.execute!(input, { toolCallId: "t", messages: [] } as never)) as O;

beforeAll(async () => {
  const client = await PGlite.create({ extensions: { btree_gist } });
  await runMigrations({ kind: "pglite", client }, { seed: false });
  db = drizzle(client, { schema }) as unknown as DB;
  await db.insert(schema.users).values({ id: "u1", email: "o@x.com", name: "Owner", passwordHash: "x" });
  await db.insert(schema.businesses).values({ id: "b1", ownerId: "u1", slug: "t", name: "Test Clinic", timezone: TZ, minNoticeMin: 0 });
  await db.insert(schema.services).values({ id: "s1", businessId: "b1", name: "Check-up", durationMin: 30, priceMinor: 20000 });
  await db.insert(schema.staff).values({ id: "a", businessId: "b1", name: "Dr A", position: 0 });
  await db.insert(schema.staffServices).values({ staffId: "a", serviceId: "s1" });
  await db.insert(schema.workingHours).values({ id: "w1", staffId: "a", weekday: 1, startMin: 9 * 60, endMin: 12 * 60 });
  const business = (await getBusinessById(db, "b1"))!;
  ctx = { db, business, catalog: await getCatalog(db, business), now: NOW, defer: (fn) => void deferred.push(fn) };
});

describe("assistant tools", () => {
  it("finds free times inside a window", async () => {
    const tools = makeTools(ctx);
    const r = await run(tools.findFreeTimes, { serviceId: "s1", from: MONDAY, days: 1, between: { from: "10:00", to: "11:00" } });
    expect(r.days?.[0].times.map((t) => t.time)).toEqual(["10:00", "10:15", "10:30", "10:45"]);
  });

  it("books, refuses the same time twice, then moves and cancels", async () => {
    const tools = makeTools(ctx);
    const first = await run(tools.bookAppointment, {
      serviceId: "s1", date: MONDAY, time: "10:00", customerName: "Sam Lee", customerPhone: "050 111 2222", language: "en", sendConfirmation: true,
    });
    expect(first.ok).toBe(true);
    expect(deferred).toHaveLength(1);

    const again = await run(tools.bookAppointment, {
      serviceId: "s1", date: MONDAY, time: "10:15", customerName: "Ana", customerPhone: "050 333 4444", language: "en", sendConfirmation: false,
    });
    expect(again.ok).toBe(false);

    const id = first.ok ? first.booking!.bookingId : "";
    const moved = await run(tools.moveAppointment, { bookingId: id, date: MONDAY, time: "11:00", summary: "Sam to 11:00" });
    expect(moved.ok && moved.booking?.start).toBe("11:00");

    const list = await run(tools.listAppointments, { date: MONDAY, includeCancelled: false });
    expect(list.appointments.map((a) => a.start)).toEqual(["11:00"]);

    const cancelled = await run(tools.cancelAppointment, { bookingId: id, summary: "Sam" });
    expect(cancelled.ok).toBe(true);
    const stats = await run(tools.businessStats, { from: MONDAY, to: MONDAY });
    expect(stats.appointments).toBe(0);
    expect(stats.cancelled).toBe(1);
  });

  it("finds customers by phone digits", async () => {
    const r = await run(makeTools(ctx).findCustomer, { query: "1112222" });
    expect(r.customers[0]?.name).toBe("Sam Lee");
  });

  it("grounds the prompt in the business's own calendar", () => {
    const p = systemPrompt(ctx);
    expect(p).toContain("2026-11-01 Sunday (today)");
    expect(p).toContain("2026-11-02 Monday (tomorrow)");
    expect(p).toContain("s1: Check-up");
  });
});
