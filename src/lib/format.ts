export type Locale = "ar" | "en";

export const isLocale = (v: unknown): v is Locale => v === "ar" || v === "en";

/** Intl locale tag. Arabic keeps Latin digits: easier to read for phone/time. */
export const intlTag = (l: Locale) => (l === "ar" ? "ar-AE-u-nu-latn" : "en-GB");

export function formatMoney(minor: number, currency: string, l: Locale) {
  return new Intl.NumberFormat(intlTag(l), {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

export function formatTime(d: Date, tz: string, l: Locale) {
  return new Intl.DateTimeFormat(intlTag(l), {
    hour: "numeric",
    minute: "2-digit",
    hour12: l === "en" ? false : true,
    timeZone: tz,
  }).format(d);
}

export function formatDateLong(d: Date, tz: string, l: Locale) {
  return new Intl.DateTimeFormat(intlTag(l), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(d);
}

export function formatDateShort(d: Date, tz: string, l: Locale) {
  return new Intl.DateTimeFormat(intlTag(l), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(d);
}

export function formatDuration(min: number, l: Locale) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (l === "ar") {
    if (h && m) return `${h} س ${m} د`;
    if (h) return h === 1 ? "ساعة" : `${h} ساعات`;
    return `${m} دقيقة`;
  }
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Pick the Arabic or English variant of a bilingual DB field. */
export const pick = (l: Locale, en: string, ar?: string | null) => (l === "ar" && ar ? ar : en);

/**
 * English dates for the dashboard, assembled from parts. Node and browsers
 * ship different ICU data ("Sept" vs "Sep", "Fri 23 Oct" vs "Fri, 23 Oct"),
 * and any difference breaks hydration, so punctuation is ours, not ICU's.
 */
export function enDate(d: Date | string, opts: Intl.DateTimeFormatOptions, tz = "UTC") {
  const dateOnly = typeof d === "string" && d.length === 10;
  const date = typeof d === "string" ? new Date(dateOnly ? `${d}T12:00:00Z` : d) : d;
  const parts = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: dateOnly ? "UTC" : tz }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value;
  return [get("weekday"), get("day"), get("month")?.replace(/^Sept$/, "Sep"), get("year")].filter(Boolean).join(" ");
}
