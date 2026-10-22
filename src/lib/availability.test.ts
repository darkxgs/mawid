import { describe, expect, it } from "vitest";
import { computeDay, computeRange, pickStaff, type Rules, type StaffInput } from "./availability";
import { zonedToUtc } from "./time";

const TZ = "Asia/Dubai"; // UTC+4, no DST
const rules: Rules = { timezone: TZ, slotIntervalMin: 15, minNoticeMin: 0, maxAdvanceDays: 30 };
const service = { durationMin: 45, bufferBeforeMin: 0, bufferAfterMin: 15 };
// 2026-11-02 is a Monday
const MONDAY = "2026-11-02";
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedToUtc(date, h * 60 + m, TZ);
};
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
const NOW = at("2026-11-01", "08:00");

const omar: StaffInput = {
  staffId: "omar",
  hours: [
    { weekday: 1, startMin: 9 * 60, endMin: 13 * 60 },
    { weekday: 1, startMin: 14 * 60, endMin: 18 * 60 },
  ],
  busy: [],
};

describe("computeDay", () => {
  it("offers slots on the grid that fit inside working hours", () => {
    const day = computeDay({ date: MONDAY, rules, service, staff: [omar], now: NOW });
    const times = day.slots.map((s) => hhmm(s.start));
    expect(times[0]).toBe("09:00");
    // 45 min must end by 13:00, so the last morning slot is 12:15
    expect(times).toContain("12:15");
    expect(times).not.toContain("12:30");
    // lunch break
    expect(times).not.toContain("13:00");
    expect(times).toContain("14:00");
    expect(times.at(-1)).toBe("17:15");
  });

  it("lets the buffer spill past closing time but not into another booking", () => {
    const busy = { start: at(MONDAY, "10:00").getTime(), end: at(MONDAY, "11:00").getTime() };
    const day = computeDay({ date: MONDAY, rules, service, staff: [{ ...omar, busy: [busy] }], now: NOW });
    const times = day.slots.map((s) => hhmm(s.start));
    // 09:00 + 45 + 15 buffer = 10:00, touches but doesn't overlap
    expect(times).toContain("09:00");
    // 09:15 would need the buffer until 10:15
    expect(times).not.toContain("09:15");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:00");
    // last slot of the day: 17:15 + 45 = 18:00, buffer after closing is fine
    expect(times.at(-1)).toBe("17:15");
  });

  it("respects minimum notice", () => {
    const now = at(MONDAY, "10:05");
    const day = computeDay({ date: MONDAY, rules: { ...rules, minNoticeMin: 60 }, service, staff: [omar], now });
    expect(hhmm(day.slots[0].start)).toBe("11:15");
  });

  it("closes days outside the booking window", () => {
    const far = computeDay({ date: "2027-03-01", rules, service, staff: [omar], now: NOW });
    expect(far.slots).toHaveLength(0);
    const past = computeDay({ date: "2026-10-26", rules, service, staff: [omar], now: NOW });
    expect(past.slots).toHaveLength(0);
  });

  it("merges staff into one slot list and reports who is free", () => {
    const sara: StaffInput = {
      staffId: "sara",
      hours: [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60 }],
      busy: [{ start: at(MONDAY, "09:00").getTime(), end: at(MONDAY, "10:00").getTime() }],
    };
    const day = computeDay({ date: MONDAY, rules, service, staff: [omar, sara], now: NOW });
    const nine = day.slots.find((s) => hhmm(s.start) === "09:00");
    const ten = day.slots.find((s) => hhmm(s.start) === "10:00");
    expect(nine?.staffIds).toEqual(["omar"]);
    expect(ten?.staffIds.sort()).toEqual(["omar", "sara"]);
  });

  it("measures how full a day is", () => {
    const busy = [{ start: at(MONDAY, "09:00").getTime(), end: at(MONDAY, "11:00").getTime() }];
    const day = computeDay({ date: MONDAY, rules, service, staff: [{ ...omar, busy }], now: NOW });
    expect(day.capacityMin).toBe(480);
    expect(day.bookedMin).toBe(120);
  });

  it("marks days without hours as closed", () => {
    const sunday = computeDay({ date: "2026-11-01", rules, service, staff: [omar], now: NOW });
    expect(sunday.closed).toBe(true);
  });
});

describe("computeRange", () => {
  it("returns one entry per day", () => {
    const range = computeRange({ from: MONDAY, days: 7, rules, service, staff: [omar], now: NOW });
    expect(range.map((d) => d.date)).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
    expect(range.filter((d) => !d.closed)).toHaveLength(1);
  });
});

describe("pickStaff", () => {
  it("prefers the least busy person", () => {
    const busyOmar = { ...omar, busy: [{ start: at(MONDAY, "09:00").getTime(), end: at(MONDAY, "12:00").getTime() }] };
    const free = { ...omar, staffId: "karim", busy: [] };
    expect(pickStaff(["omar", "karim"], [busyOmar, free], MONDAY, TZ)).toBe("karim");
  });
});
