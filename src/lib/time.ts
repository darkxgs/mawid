// Time helpers. All instants are stored in UTC; "local" values belong to the
// business's IANA timezone. Calendar dates are plain "YYYY-MM-DD" strings so
// they never drift when they cross a server in a different timezone.
import { TZDate } from "@date-fns/tz";

export type DateStr = string; // YYYY-MM-DD

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDateStr(d: DateStr): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

/** The instant at `minutes` past local midnight of `date` in `tz`. */
export function zonedToUtc(date: DateStr, minutes: number, tz: string): Date {
  const { y, m, day } = parseDateStr(date);
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  // TZDate handles DST gaps/overlaps the same way the platform does.
  return new Date(new TZDate(y, m - 1, day, h, min, tz).getTime());
}

/** Local calendar date of an instant in `tz`. */
export function localDate(instant: Date, tz: string): DateStr {
  const z = new TZDate(instant.getTime(), tz);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** Minutes past local midnight of an instant in `tz`. */
export function localMinutes(instant: Date, tz: string): number {
  const z = new TZDate(instant.getTime(), tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** 0 = Sunday ... 6 = Saturday, for a calendar date. */
export function weekdayOf(date: DateStr): number {
  const { y, m, day } = parseDateStr(date);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

export function addDays(date: DateStr, n: number): DateStr {
  const { y, m, day } = parseDateStr(date);
  const d = new Date(Date.UTC(y, m - 1, day + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysBetween(a: DateStr, b: DateStr): number {
  const pa = parseDateStr(a);
  const pb = parseDateStr(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.day) - Date.UTC(pa.y, pa.m - 1, pa.day)) / 86_400_000,
  );
}

export function isDateStr(v: unknown): v is DateStr {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function minutesToHHMM(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export const addMinutes = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
