// Reads a front-desk question in English or Arabic (Gulf and Egyptian
// phrasing) and turns it into a Step. Deterministic and pure: no network, no
// model, and the same words always give the same answer.
import { addDays, weekdayOf } from "@/lib/time";
import type { BookStep, DayPart, StatsRange, Step } from "./types";

type Named = { id: string; name: string; nameAr?: string | null };
export type UnderstandContext = { today: string; services: Named[]; staff: Named[] };

/* ------------------------------ text ------------------------------- */

const AR_DIGITS = /[٠-٩]/g;
const asciiDigits = (s: string) => s.replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));

/** Lowercase, Latin digits, and the Arabic letter variants people mix freely. */
export function norm(s: string) {
  return asciiDigits(s)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[’‘`]/g, "'")
    .replace(/'s\b/g, "");
}

const AR_PREFIXES = ["وال", "بال", "فال", "لل", "ال", "و", "ب", "ف", "ل"];

function stems(tok: string) {
  const out = [tok];
  if (/[؀-ۿ]/.test(tok)) {
    for (const p of AR_PREFIXES) if (tok.startsWith(p) && tok.length - p.length >= 3) out.push(tok.slice(p.length));
  } else if (tok.length > 4 && tok.endsWith("s")) {
    out.push(tok.slice(0, -1));
  }
  return out;
}

const tokenize = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

class Said {
  readonly flat: string;
  readonly words: Set<string>;
  constructor(readonly raw: string) {
    const n = norm(raw);
    const toks = tokenize(n);
    this.flat = ` ${toks.join(" ")} `;
    this.words = new Set(toks.flatMap(stems));
  }
  /** True if any of the words or phrases appears. Phrases match whole words. */
  has(list: readonly string[]) {
    return list.some((w) => (w.includes(" ") ? this.flat.includes(` ${w} `) : this.words.has(w)));
  }
}

// Keyword lists are written already normalised (ه for ة, ي for ى, bare alif).
const HELP = ["help", "what can you do", "how does this work", "مساعده", "ساعدني", "تقدر تعمل ايه", "بتعمل ايه", "ماذا تستطيع"];
const CANCEL = ["cancel", "call off", "الغي", "الغاء", "كنسل", "الغيه", "الغيلي"];
const MOVE = ["move", "reschedule", "postpone", "push back", "bring forward", "change the time", "انقل", "نقل", "اجل", "اجله", "تاجيل", "غير موعد", "غير الموعد", "غير وقت", "تغيير موعد", "تغيير الموعد"];
const STATS = ["no show", "no shows", "noshow", "noshows", "takings", "revenue", "income", "earned", "stats", "statistics", "numbers", "summary", "report", "how did", "how was", "احصائيات", "احصائيه", "الدخل", "دخل", "ايراد", "ايرادات", "غياب", "ما حضر", "ماحضرش", "محضرش", "لم يحضر", "تقرير", "ملخص", "الارقام"];
const HOW_MANY = ["how many", "how much", "كم", "قديش"];
const BOOK = ["book", "make an appointment", "new appointment", "new booking", "squeeze in", "fit in", "schedule in", "احجز", "احجزلي", "احجزي", "حجز موعد", "حجز جديد", "موعد جديد", "سجل موعد"];
const FREE = ["free", "available", "availability", "opening", "openings", "slot", "slots", "gap", "gaps", "فاضي", "فاضيه", "فاضين", "متاح", "متاحه", "متوفر", "فراغ"];
const DAY = ["schedule", "diary", "agenda", "calendar", "appointments", "appointment", "bookings", "who has", "who is in", "what on", "whats on", "on today", "list", "مواعيد", "المواعيد", "جدول", "الجدول", "مين عنده", "عنده ايه", "عندنا ايه", "حجوزات", "الحجوزات"];
const CUSTOMER = ["find", "look up", "lookup", "search", "customer", "patient", "client", "ابحث", "دور علي", "عميل", "العميل", "مريض", "المريض", "زبون"];

const TODAY = ["today", "tonight", "this morning", "this afternoon", "this evening", "اليوم", "النهارده", "النهاردا", "الليله"];
const TOMORROW = ["tomorrow", "tmrw", "tmr", "بكره", "بكرا", "غدا", "باكر", "باچر"];
const AFTER_TOMORROW = ["day after tomorrow", "بعد بكره", "بعد بكرا", "بعد غد", "بعد غدا"];
const YESTERDAY = ["yesterday", "امس", "امبارح", "البارحه"];
const NEXT = ["next", "الجاي", "الجايه", "القادم", "القادمه"];
const WEEKDAYS: string[][] = [
  ["sunday", "sun", "الاحد"],
  ["monday", "mon", "الاثنين", "الاتنين"],
  ["tuesday", "tue", "tues", "الثلاثاء", "التلات"],
  ["wednesday", "wed", "الاربعاء"],
  ["thursday", "thu", "thur", "thurs", "الخميس"],
  ["friday", "fri", "الجمعه"],
  ["saturday", "sat", "السبت"],
];

const PARTS: Record<DayPart, string[]> = {
  morning: ["morning", "الصبح", "صباح", "الصباح", "صباحا", "بدري"],
  afternoon: ["afternoon", "lunch", "midday", "noon", "الظهر", "الضهر", "بعد الظهر", "بعد الضهر", "العصر", "عصر", "ظهرا"],
  evening: ["evening", "tonight", "night", "المسا", "مساء", "المساء", "مسا", "بالليل", "الليل", "الليله"],
};

const RANGES: [StatsRange, string[]][] = [
  ["lastweek", ["last week", "past week", "previous week", "الاسبوع الماضي", "الاسبوع اللي فات", "الاسبوع الي فات", "الاسبوع السابق", "الاسبوع اللي قبل"]],
  ["lastmonth", ["last month", "past month", "previous month", "الشهر الماضي", "الشهر اللي فات", "الشهر الي فات", "الشهر السابق"]],
  ["week", ["this week", "week", "الاسبوع", "هذا الاسبوع", "الاسبوع ده", "الاسبوع هذا"]],
  ["month", ["this month", "month", "الشهر", "هذا الشهر", "الشهر ده", "الشهر هذا"]],
  ["yesterday", YESTERDAY],
  ["today", TODAY],
];

/* ----------------------------- pieces ------------------------------ */

function findDate(s: Said, today: string): string | undefined {
  if (s.has(AFTER_TOMORROW)) return addDays(today, 2);
  if (s.has(TOMORROW)) return addDays(today, 1);
  if (s.has(YESTERDAY)) return addDays(today, -1);
  if (s.has(TODAY)) return today;
  const wd = WEEKDAYS.findIndex((names) => s.has(names));
  if (wd >= 0) {
    let ahead = (wd - weekdayOf(today) + 7) % 7;
    if (ahead === 0 && s.has(NEXT)) ahead = 7;
    return addDays(today, ahead);
  }
  // 29/10 (day first, as written in the Gulf)
  const m = asciiDigits(s.raw).match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:[^\d]|$)/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = Number(today.slice(0, 4));
      const iso = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (iso(year) < addDays(today, -30)) year += 1;
      return iso(year);
    }
  }
  return undefined;
}

function findPart(s: Said): DayPart | undefined {
  // "بعد الظهر" contains "الظهر"; check the more specific phrases by order.
  return (Object.keys(PARTS) as DayPart[]).find((p) => s.has(PARTS[p]));
}

/** "at 3pm", "15:30", "الساعة 4". Bare numbers without "at" are ignored. */
export function findTime(raw: string): string | undefined {
  const t = norm(raw);
  const patterns = [
    /(?:\bat|@|الساعه|ساعه)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|ص|م|صباحا|مساء)?/,
    /(?:^|[^\d/])(\d{1,2}):(\d{2})\s*(am|pm|ص|م)?/,
    /(?:^|[^\d])(\d{1,2})\s*(am|pm)\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    let h = Number(m[1]);
    const min = re === patterns[2] ? 0 : Number(m[2] ?? 0);
    const suffix = re === patterns[2] ? m[2] : m[3];
    if (suffix === "pm" || suffix === "م" || suffix === "مساء") {
      if (h < 12) h += 12;
    } else if (suffix === "am" || suffix === "ص" || suffix === "صباحا") {
      if (h === 12) h = 0;
    } else if (h >= 1 && h < 8) {
      h += 12; // nobody books a clinic at 3 in the morning
    }
    if (h > 23 || min > 59) continue;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return undefined;
}

export function findPhone(raw: string): string | undefined {
  const m = asciiDigits(raw).match(/\+?\d[\d\s-]{6,16}\d/);
  if (!m) return undefined;
  const digits = m[0].replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 8 ? m[0].trim() : undefined;
}

// Generic words that would make every service match.
const SERVICE_STOP = new Set(["and", "the", "for", "with", "visit", "teeth", "tooth", "your", "اسنان", "الاسنان", "زياره"]);
const SERVICE_SYNONYMS: Record<string, string> = {
  checkup: "check",
  clean: "cleaning",
  scaling: "cleaning",
  kids: "children",
  kid: "children",
  child: "children",
  pain: "toothache",
  ache: "toothache",
  hurts: "toothache",
  whiten: "whitening",
  invisalign: "aligner",
  تبيض: "تبييض",
  وجع: "الم",
  حشو: "حشوه",
  طفل: "اطفال",
};

function keywordsOf(n: Named) {
  const words = tokenize(norm(`${n.name} ${n.nameAr ?? ""}`)).flatMap(stems);
  return [...new Set(words.filter((w) => w.length >= 3 && !SERVICE_STOP.has(w)))];
}

function bestMatch(s: Said, items: Named[]) {
  const words = new Set(s.words);
  for (const w of s.words) if (SERVICE_SYNONYMS[w]) words.add(SERVICE_SYNONYMS[w]);
  let best: { id: string; score: number } | undefined;
  for (const item of items) {
    const score = keywordsOf(item).filter((k) => words.has(k)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: item.id, score };
  }
  return best?.id;
}

const findService = (s: Said, services: Named[]) => bestMatch(s, services);
const findStaff = (s: Said, staff: Named[]) => bestMatch(s, staff);

function findRange(s: Said): StatsRange | undefined {
  return RANGES.find(([, words]) => s.has(words))?.[0];
}

/* ------------------------- names and lookups ----------------------- */

const QUERY_STOP = new Set(
  [
    ...["cancel", "move", "reschedule", "postpone", "push", "back", "bring", "forward", "change", "time", "find", "look", "up", "lookup", "search"],
    ...["customer", "patient", "client", "appointment", "appointments", "booking", "bookings", "visit", "the", "a", "an", "for", "of", "to", "please", "pls"],
    ...["his", "her", "their", "my", "next", "upcoming", "with", "at", "on", "and", "from", "is", "who", "show", "me", "can", "you", "i", "want", "need", "call", "off", "in"],
    ...["الغي", "الغاء", "كنسل", "الغيه", "انقل", "نقل", "اجل", "تاجيل", "غير", "تغيير", "موعد", "الموعد", "مواعيد", "حجز", "الحجز", "ابحث", "دور", "علي", "عن", "عميل", "العميل"],
    ...["مريض", "المريض", "زبون", "ل", "من", "الي", "يا", "لو", "سمحت", "ممكن", "بتاع", "تبع", "حق", "وقت", "رقم", "اسم"],
    ...TODAY, ...TOMORROW, ...YESTERDAY, ...NEXT, ...WEEKDAYS.flat(),
    ...Object.values(PARTS).flat(),
  ].flatMap((w) => tokenize(norm(w))),
);

/** The name or phone digits left once the request words are taken out. */
export function customerQuery(raw: string): string | undefined {
  const digits = asciiDigits(raw).match(/\d[\d\s-]{2,}\d/);
  if (digits && digits[0].replace(/\D/g, "").length >= 4) return digits[0].replace(/\D/g, "");
  const kept = asciiDigits(raw)
    .replace(/[’']s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !stems(norm(w)).some((x) => QUERY_STOP.has(x)) && !/^\d+$/.test(w));
  const q = kept.join(" ").trim();
  return q.length >= 2 ? q : undefined;
}

/** "Book Sophie Turner (050…) for whitening" → "Sophie Turner". */
function bookingName(raw: string, phone: string | undefined, ctx: UnderstandContext): string | undefined {
  const text = asciiDigits(raw);
  const en = text.match(/\b[Bb]ook\s+(?:(?:an?\s+(?:appointment|visit)\s+)?for\s+|in\s+)?([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3})/u);
  let name = en?.[1];
  if (!name && phone) {
    const ar = text.match(/(?:احجز|حجز)\s+(?:موعد\s+)?(?:لـ?\s*|باسم\s+|للعميل\s+|للمريض\s+)?([^\d+]+?)\s*[(+\d]/u);
    name = ar?.[1];
  }
  if (!name) return undefined;
  const said = new Said(name);
  // Not a name if it is really a service, a team member or a day.
  if (findService(said, ctx.services) || findStaff(said, ctx.staff) || findDate(said, ctx.today) || said.has(["dr", "doctor"])) return undefined;
  const clean = name.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  return clean.length >= 2 && clean.length <= 60 ? clean : undefined;
}

/* ------------------------------ main ------------------------------- */

/** Free text to a Step, or null when nothing in it is recognisable. */
export function understand(raw: string, ctx: UnderstandContext): Step | null {
  const s = new Said(raw);
  const date = findDate(s, ctx.today);
  const part = findPart(s);

  if (s.has(HELP)) return { t: "help" };
  if (s.has(CANCEL)) return strip({ t: "customer", query: customerQuery(raw), then: "cancel" });
  if (s.has(MOVE)) return strip({ t: "customer", query: customerQuery(raw), then: "move", date, part });

  const range = findRange(s);
  const howMany = s.has(HOW_MANY);
  if (s.has(STATS) || (howMany && range && range !== "today" && range !== "yesterday")) {
    return { t: "stats", range: range ?? "week" };
  }

  const serviceId = findService(s, ctx.services);
  const staffId = findStaff(s, ctx.staff);

  if (s.has(BOOK)) {
    const phone = findPhone(raw);
    const step: BookStep = { t: "book", serviceId, date, staffId, part, time: findTime(raw), phone, name: bookingName(raw, phone, ctx) };
    return Object.fromEntries(Object.entries(step).filter(([, v]) => v !== undefined)) as BookStep;
  }
  if (s.has(FREE)) return strip({ t: "free", serviceId, date, staffId, part });
  if (s.has(DAY) || date || staffId || howMany) return strip({ t: "day", date: date ?? ctx.today, staffId, part });
  if (s.has(CUSTOMER) || findPhone(raw) || /\d{4,}/.test(asciiDigits(raw))) return strip({ t: "customer", query: customerQuery(raw) });
  if (serviceId) return strip({ t: "free", serviceId, part });
  // Just a name, typed the way names are written: look the customer up.
  if (/^[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3}$/u.test(raw.trim())) return { t: "customer", query: raw.trim() };
  return null;
}

function strip<T extends Step>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
