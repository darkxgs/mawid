// The availability engine. Pure functions, no I/O: given working hours, busy
// ranges and booking rules, work out which start times can be offered.
//
// Rules, in plain words:
// - A slot starts on the business's slot grid (every N minutes from midnight).
// - The appointment itself must fit inside one working interval.
// - Buffers (clean-up time) may not overlap anything else, but they may spill
//   past closing time, the same way a real clinic tidies up after the last visit.
// - Nothing can be booked sooner than `minNoticeMin` from now, or further out
//   than `maxAdvanceDays`.
import { addDays, daysBetween, localDate, weekdayOf, zonedToUtc, type DateStr } from "./time";

export type Interval = { start: number; end: number }; // epoch ms, half-open [start, end)

export type WeeklyHours = { weekday: number; startMin: number; endMin: number };

export type StaffInput = {
  staffId: string;
  hours: WeeklyHours[];
  /** Bookings (occupied ranges, buffers included) and time off. */
  busy: Interval[];
};

export type ServiceSpec = {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
};

export type Rules = {
  timezone: string;
  slotIntervalMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
};

export type Slot = { start: Date; staffIds: string[] };

export type DayAvailability = {
  date: DateStr;
  slots: Slot[];
  /** Working minutes across the staff who can do this service. */
  capacityMin: number;
  /** Of those, minutes already taken. Drives the "how busy" bar. */
  bookedMin: number;
  closed: boolean;
};

const MIN = 60_000;

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

function overlapMs(a: Interval, b: Interval) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Working intervals of one staff member on one local date, as UTC ranges. */
export function workingIntervals(hours: WeeklyHours[], date: DateStr, tz: string): Interval[] {
  const wd = weekdayOf(date);
  return hours
    .filter((h) => h.weekday === wd)
    .sort((a, b) => a.startMin - b.startMin)
    .map((h) => ({
      start: zonedToUtc(date, h.startMin, tz).getTime(),
      end: zonedToUtc(date, h.endMin, tz).getTime(),
    }));
}

export function isBookableWindow(date: DateStr, rules: Rules, now: Date): boolean {
  const today = localDate(now, rules.timezone);
  const ahead = daysBetween(today, date);
  return ahead >= 0 && ahead <= rules.maxAdvanceDays;
}

export function computeDay(args: {
  date: DateStr;
  rules: Rules;
  service: ServiceSpec;
  staff: StaffInput[];
  now: Date;
}): DayAvailability {
  const { date, rules, service, staff, now } = args;
  const earliest = now.getTime() + rules.minNoticeMin * MIN;
  const bookable = isBookableWindow(date, rules, now);
  const byStart = new Map<number, string[]>();
  let capacity = 0;
  let booked = 0;

  for (const s of staff) {
    const work = workingIntervals(s.hours, date, rules.timezone);
    for (const w of work) {
      capacity += (w.end - w.start) / MIN;
      for (const b of s.busy) booked += overlapMs(w, b) / MIN;
    }
    if (!bookable) continue;

    const midnight = zonedToUtc(date, 0, rules.timezone).getTime();
    const step = rules.slotIntervalMin * MIN;
    for (const w of work) {
      // first grid point at or after the start of the working interval
      let t = midnight + Math.ceil((w.start - midnight) / step) * step;
      for (; t + service.durationMin * MIN <= w.end; t += step) {
        if (t < earliest) continue;
        const occupied: Interval = {
          start: t - service.bufferBeforeMin * MIN,
          end: t + (service.durationMin + service.bufferAfterMin) * MIN,
        };
        if (s.busy.some((b) => overlaps(occupied, b))) continue;
        const list = byStart.get(t);
        if (list) list.push(s.staffId);
        else byStart.set(t, [s.staffId]);
      }
    }
  }

  const slots = [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, ids]) => ({ start: new Date(t), staffIds: ids }));

  return {
    date,
    slots,
    capacityMin: Math.round(capacity),
    bookedMin: Math.round(Math.min(booked, capacity)),
    closed: capacity === 0,
  };
}

export function computeRange(args: {
  from: DateStr;
  days: number;
  rules: Rules;
  service: ServiceSpec;
  staff: StaffInput[];
  now: Date;
}): DayAvailability[] {
  const out: DayAvailability[] = [];
  for (let i = 0; i < args.days; i++) {
    out.push(computeDay({ ...args, date: addDays(args.from, i) }));
  }
  return out;
}

/** Window a booking occupies, buffers included. */
export function occupiedWindow(start: Date, service: ServiceSpec): Interval {
  return {
    start: start.getTime() - service.bufferBeforeMin * MIN,
    end: start.getTime() + (service.durationMin + service.bufferAfterMin) * MIN,
  };
}

/**
 * When a customer picks "anyone available", give the slot to the staff member
 * with the least booked time that day so the work spreads evenly.
 */
export function pickStaff(candidates: string[], staff: StaffInput[], date: DateStr, tz: string): string {
  let best = candidates[0];
  let bestLoad = Infinity;
  for (const id of candidates) {
    const s = staff.find((x) => x.staffId === id);
    if (!s) continue;
    const work = workingIntervals(s.hours, date, tz);
    const load = work.reduce((sum, w) => sum + s.busy.reduce((a, b) => a + overlapMs(w, b), 0), 0);
    if (load < bestLoad) {
      bestLoad = load;
      best = id;
    }
  }
  return best;
}
