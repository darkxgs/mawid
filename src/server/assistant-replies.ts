import "server-only";
// The assistant's ready replies. Each Step is answered from live data with a
// short sentence, a card to scan and the next things worth tapping. Nothing
// is generated: the wording is written here, in English and Arabic.
import { PART_WINDOW, type Block, type BookStep, type Chip, type DayPart, type Lang, type Reply, type Row, type StatsRange, type Step } from "@/lib/assistant/types";
import { understand } from "@/lib/assistant/understand";
import { enDate, formatDuration, formatMoney, pick } from "@/lib/format";
import { currencyCountry, formatPhone, normalizePhone } from "@/lib/phone";
import { addDays, localDate, localMinutes, minutesToHHMM, weekdayOf } from "@/lib/time";
import { assistantOps, type AssistantContext, type AssistantOps, type FoundBooking, type OpError } from "./assistant";

type C = { ctx: AssistantContext; ops: AssistantOps; l: Lang; today: string; nowMin: number };

/* ----------------------------- wording ----------------------------- */

const tr = (l: Lang, en: string, ar: string) => (l === "ar" ? ar : en);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function apptAr(n: number) {
  if (n === 0) return "لا مواعيد";
  if (n === 1) return "موعد واحد";
  if (n === 2) return "موعدان";
  if (n <= 10) return `${n} مواعيد`;
  return `${n} موعدًا`;
}
const appts = (l: Lang, n: number) => (l === "ar" ? apptAr(n) : plural(n, "appointment"));

const AR_DATE = new Intl.DateTimeFormat("ar-AE-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const AR_SHORT = new Intl.DateTimeFormat("ar-AE-u-nu-latn", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const AR_SPAN = new Intl.DateTimeFormat("ar-AE-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

const longDate = (l: Lang, d: string) => (l === "ar" ? AR_DATE.format(noon(d)) : enDate(d, { weekday: "long", day: "numeric", month: "long" }));
const shortDate = (l: Lang, d: string) => (l === "ar" ? AR_SHORT.format(noon(d)) : enDate(d, { weekday: "short", day: "numeric", month: "short" }));
const spanDate = (l: Lang, d: string) => (l === "ar" ? AR_SPAN.format(noon(d)) : enDate(d, { day: "numeric", month: "short" }));

/** "14:30" in English (the dashboard is 24-hour), "2:30 م" in Arabic. */
function tl(l: Lang, hhmm: string) {
  if (l === "en") return hhmm;
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? "ص" : "م"}`;
}

const PART_EN: Record<DayPart, string> = { morning: "morning", afternoon: "afternoon", evening: "evening" };
const PART_AR: Record<DayPart, string> = { morning: "صباحًا", afternoon: "بعد الظهر", evening: "مساءً" };
const PART_AR_NOUN: Record<DayPart, string> = { morning: "الصباح", afternoon: "بعد الظهر", evening: "المساء" };

function relDay(c: C, d: string) {
  if (d === c.today) return tr(c.l, "today", "اليوم");
  if (d === addDays(c.today, 1)) return tr(c.l, "tomorrow", "غدًا");
  if (d === addDays(c.today, -1)) return tr(c.l, "yesterday", "أمس");
  return null;
}

/** Mid-sentence: "this afternoon", "tomorrow morning", "on Monday 26 October". */
function when(c: C, d: string, part?: DayPart) {
  const rel = relDay(c, d);
  if (c.l === "ar") return `${rel ?? `يوم ${longDate("ar", d)}`}${part ? ` ${PART_AR[part]}` : ""}`;
  if (rel === "today" && part) return `this ${PART_EN[part]}`;
  if (rel) return part ? `${rel} ${PART_EN[part]}` : rel;
  return `on ${longDate("en", d)}${part ? ` in the ${PART_EN[part]}` : ""}`;
}

/** Card titles: "Tomorrow, Saturday 24 October". */
function heading(c: C, d: string, part?: DayPart) {
  const rel = relDay(c, d);
  const base = [rel ? cap(rel) : null, longDate(c.l, d)].filter(Boolean).join(c.l === "ar" ? "، " : ", ");
  return part ? `${base}${c.l === "ar" ? "، " : ", "}${c.l === "ar" ? PART_AR_NOUN[part] : PART_EN[part]}` : base;
}

const svc = (c: C, id: string) => {
  const s = c.ctx.catalog.services.find((x) => x.id === id);
  return s ? pick(c.l, s.name, s.nameAr) : tr(c.l, "a service", "خدمة");
};
const who = (c: C, id: string) => {
  const s = c.ctx.catalog.staff.find((x) => x.id === id);
  return s ? pick(c.l, s.name, s.nameAr) : tr(c.l, "someone", "أحد الفريق");
};
const firstName = (name: string) => name.split(/\s+/)[0];

function errText(l: Lang, e: OpError) {
  const t: Record<OpError, [string, string]> = {
    slot_taken: ["That time was just taken by someone else.", "هذا الوقت انحجز للتو."],
    hold_expired: ["That time was just taken by someone else.", "هذا الوقت انحجز للتو."],
    not_available: ["That time isn't free any more.", "هذا الوقت لم يعد متاحًا."],
    not_found: ["I couldn't find that appointment.", "لم أجد هذا الموعد."],
    invalid: ["That appointment can't be changed now. It may already be cancelled or finished.", "لا يمكن تعديل هذا الموعد الآن، فقد يكون ملغيًا أو منتهيًا."],
    too_late: ["It's too late to change that appointment.", "فات وقت تعديل هذا الموعد."],
    bad_phone: ["That mobile number doesn't look right.", "رقم الجوال غير صحيح."],
  };
  return tr(l, ...t[e]);
}

const STATUS: Record<string, [string, string]> = {
  completed: ["Attended", "حضر"],
  no_show: ["No-show", "لم يحضر"],
  cancelled: ["Cancelled", "ملغي"],
};

function reply(c: C, text: string, more: Partial<Omit<Reply, "lang" | "text">> = {}): Reply {
  return { lang: c.l, text, blocks: more.blocks ?? [], chips: more.chips ?? [], expect: more.expect };
}

/* ------------------------------ entry ------------------------------ */

export async function respond(ctx: AssistantContext, step: Step, l: Lang): Promise<Reply> {
  const tz = ctx.business.timezone;
  const c: C = { ctx, ops: assistantOps(ctx), l, today: localDate(ctx.now, tz), nowMin: localMinutes(ctx.now, tz) };
  if (step.t === "text") {
    const s = understand(step.text, { today: c.today, services: ctx.catalog.services, staff: ctx.catalog.staff });
    return s ? answer(c, s) : fallback(c);
  }
  return answer(c, step);
}

async function answer(c: C, s: Step): Promise<Reply> {
  switch (s.t) {
    case "text":
    case "help":
      return help(c);
    case "noop":
      return reply(c, tr(c.l, "Okay, nothing changed.", "تمام، لم يتغير شيء."));
    case "day":
      return day(c, s.date, s.staffId, s.part);
    case "free":
      return free(c, s);
    case "stats":
      return stats(c, s.range);
    case "customer":
      return customer(c, s);
    case "book":
      return book(c, s);
    case "book.confirm":
      return bookConfirm(c, s);
    case "cancel":
      return cancel(c, s.bookingId);
    case "cancel.confirm":
      return cancelConfirm(c, s.bookingId);
    case "move":
      return move(c, s);
    case "move.confirm":
      return moveConfirm(c, s);
  }
}

export function starterChips(l: Lang, today: string): Chip[] {
  return [
    { label: tr(l, "What's on today?", "مواعيد اليوم"), step: { t: "day", date: today } },
    { label: tr(l, "Free times tomorrow afternoon", "الأوقات المتاحة غدًا بعد الظهر"), step: { t: "free", date: addDays(today, 1), part: "afternoon" } },
    { label: tr(l, "How did last week go?", "كيف كان الأسبوع الماضي؟"), step: { t: "stats", range: "lastweek" } },
    { label: tr(l, "Book an appointment", "احجز موعدًا"), step: { t: "book" } },
    { label: tr(l, "Find a customer", "ابحث عن عميل"), step: { t: "customer" } },
  ];
}

function help(c: C) {
  return reply(
    c,
    tr(
      c.l,
      "I answer the usual front-desk questions from the live schedule: who's in, what's free, a customer's visits and the week's numbers. I can also book, move or cancel, and nothing changes until you confirm.",
      "أجاوب على أسئلة الاستقبال المعتادة من الجدول المباشر: مواعيد اليوم، الأوقات المتاحة، زيارات العميل وأرقام الأسبوع. وأقدر أحجز أو أنقل أو ألغي، ولا يتغير شيء قبل تأكيدك.",
    ),
    { chips: starterChips(c.l, c.today) },
  );
}

function fallback(c: C) {
  return reply(
    c,
    tr(
      c.l,
      "I didn't catch that. I understand questions about the schedule, free times, customers and the numbers, and I can book, move or cancel. These are a good start:",
      "لم أفهم الطلب. أفهم الأسئلة عن الجدول والأوقات المتاحة والعملاء والأرقام، وأقدر أحجز أو أنقل أو ألغي. جرّب واحدة من هذه:",
    ),
    { chips: starterChips(c.l, c.today) },
  );
}

/* ------------------------------ diary ------------------------------ */

const inPart = (hhmm: string, part?: DayPart) => !part || (toMin(hhmm) >= PART_WINDOW[part][0] && toMin(hhmm) < PART_WINDOW[part][1]);

async function day(c: C, date: string, staffId?: string, part?: DayPart): Promise<Reply> {
  const rows = (await c.ops.listAppointments({ date, staffId })).filter((r) => inPart(r.start, part));
  const person = staffId ? who(c, staffId) : null;
  const w = when(c, date, part);
  let text: string;

  if (!rows.length) {
    text = person ? tr(c.l, `${person} has nothing booked ${w}.`, `لا توجد مواعيد لـ${person} ${w}.`) : tr(c.l, `Nothing is booked ${w}.`, `لا توجد مواعيد ${w}.`);
  } else {
    const first = tl(c.l, rows[0].start);
    const last = tl(c.l, rows.reduce((a, r) => (r.end > a ? r.end : a), rows[0].end));
    text = person
      ? tr(c.l, `${person} has ${appts("en", rows.length)} ${w}, from ${first} to ${last}.`, `لدى ${person} ${apptAr(rows.length)} ${w}، من ${first} إلى ${last}.`)
      : tr(c.l, `${cap(w)}: ${appts("en", rows.length)}, from ${first} to ${last}.`, `${w}: ${apptAr(rows.length)}، من ${first} إلى ${last}.`);
    if (!person) {
      const per = new Map<string, number>();
      for (const r of rows) per.set(r.staffId, (per.get(r.staffId) ?? 0) + 1);
      const [topId, topN] = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
      if (per.size > 1) text += tr(c.l, ` ${who(c, topId)} is busiest with ${topN}.`, ` الأكثر انشغالًا ${who(c, topId)} (${topN}).`);
    }
    if (date === c.today) {
      const ahead = rows.filter((r) => r.status === "confirmed" && toMin(r.start) >= c.nowMin).length;
      text += ahead ? tr(c.l, ` ${ahead} still to come.`, ` ${ahead} لم تبدأ بعد.`) : tr(c.l, " All of them have started.", " كلها بدأت.");
    }
  }

  const chips: Chip[] = [{ label: tr(c.l, "Free times that day", "الأوقات المتاحة في نفس اليوم"), step: { t: "free", date, staffId, part } }];
  if (part) chips.push({ label: tr(c.l, "The whole day", "اليوم كله"), step: { t: "day", date, staffId } });
  if (staffId) chips.push({ label: tr(c.l, "Everyone that day", "كل الفريق في نفس اليوم"), step: { t: "day", date, part } });
  chips.push({ label: tr(c.l, "The next day", "اليوم التالي"), step: { t: "day", date: addDays(date, 1), staffId, part } });

  return reply(c, text, {
    blocks: rows.length
      ? [
          {
            kind: "list",
            title: person ? `${heading(c, date, part)}${c.l === "ar" ? "، " : ", "}${person}` : heading(c, date, part),
            rows: rows.map((r) => ({
              time: tl(c.l, r.start),
              title: r.customer?.name ?? tr(c.l, "Walk-in", "بدون اسم"),
              detail: svc(c, r.serviceId),
              who: person ? undefined : who(c, r.staffId),
              status: r.status === "confirmed" || r.status === "held" ? undefined : r.status,
            })),
            href: `/dashboard?date=${date}`,
            linkLabel: tr(c.l, "Open the day", "افتح اليوم"),
          },
        ]
      : [],
    chips,
  });
}

/* --------------------------- free times ---------------------------- */

type Opening = { date: string; times: { time: string; staffIds: string[] }[] };

/** Free times in the asked window, or the first day with any in the two weeks after. */
async function openings(
  c: C,
  q: { serviceId: string; date?: string; staffId?: string; part?: DayPart; excludeBookingId?: string; skip?: { date: string; time: string } },
): Promise<{ days: Opening[]; later: boolean }> {
  const between = q.part ? { from: minutesToHHMM(PART_WINDOW[q.part][0]), to: minutesToHHMM(PART_WINDOW[q.part][1]) } : undefined;
  const from = q.date ?? c.today;
  const span = q.date ? 1 : 7;
  const clean = (ds: Opening[]) =>
    ds.map((d) => ({ ...d, times: d.times.filter((t) => !(q.skip && d.date === q.skip.date && t.time === q.skip.time)) })).filter((d) => d.times.length);
  const base = { serviceId: q.serviceId, staffId: q.staffId, between, excludeBookingId: q.excludeBookingId };
  const now = clean(await c.ops.findFreeTimes({ ...base, from, days: span }));
  if (now.length) return { days: now, later: false };
  const later = clean(await c.ops.findFreeTimes({ ...base, from: addDays(from, span), days: 14 }));
  return { days: later.slice(0, 1), later: true };
}

function timesBlock(c: C, title: string, hint: string, days: Opening[], step: (date: string, time: string, staffIds: string[]) => Step): Block {
  const MAX = 16;
  return {
    kind: "times",
    title,
    hint,
    days: days.slice(0, 3).map((d) => ({
      date: d.date,
      label: heading(c, d.date),
      more: Math.max(0, d.times.length - MAX),
      times: d.times.slice(0, MAX).map((t) => ({
        time: t.time,
        label: tl(c.l, t.time),
        who: t.staffIds.map((id) => who(c, id)).join(c.l === "ar" ? "، " : ", "),
        step: step(d.date, t.time, t.staffIds),
      })),
    })),
  };
}

function servicePicker(c: C, text: string, next: (serviceId: string) => Step): Reply {
  return reply(c, text, { chips: c.ctx.catalog.services.filter((s) => s.active).map((s) => ({ label: pick(c.l, s.name, s.nameAr), step: next(s.id) })) });
}

async function free(c: C, s: Extract<Step, { t: "free" }>): Promise<Reply> {
  if (!s.serviceId) return servicePicker(c, tr(c.l, "Free times for which service?", "الأوقات المتاحة لأي خدمة؟"), (serviceId) => ({ ...s, serviceId }));
  const name = svc(c, s.serviceId);
  const person = s.staffId ? who(c, s.staffId) : null;
  const withWhom = person ? tr(c.l, ` with ${person}`, ` مع ${person}`) : "";
  const { days, later } = await openings(c, { serviceId: s.serviceId, date: s.date, staffId: s.staffId, part: s.part });

  const chips: Chip[] = [];
  if (s.part) chips.push({ label: tr(c.l, "Any time of day", "أي وقت في اليوم"), step: { ...s, part: undefined } });
  else if (s.date) {
    for (const p of ["morning", "afternoon", "evening"] as DayPart[]) chips.push({ label: c.l === "ar" ? PART_AR_NOUN[p] : cap(PART_EN[p]), step: { ...s, part: p } });
  }
  if (s.date) chips.push({ label: tr(c.l, "The next day", "اليوم التالي"), step: { ...s, date: addDays(s.date, 1) } });
  if (s.staffId) chips.push({ label: tr(c.l, "Anyone on the team", "أي أحد من الفريق"), step: { ...s, staffId: undefined } });
  chips.push({ label: tr(c.l, "Another service", "خدمة أخرى"), step: { ...s, serviceId: undefined } });

  if (!days.length) {
    const w = s.date ? when(c, s.date, s.part) : tr(c.l, "this week", "هذا الأسبوع");
    return reply(c, tr(c.l, `Nothing is free for ${name}${withWhom} ${w}, or in the two weeks after.`, `لا يوجد وقت متاح لـ${name}${withWhom} ${w}، ولا في الأسبوعين التاليين.`), { chips });
  }

  const first = days[0];
  const t0 = first.times[0];
  const firstWho = who(c, s.staffId ?? t0.staffIds[0]);
  let text: string;
  if (later) {
    const w = s.date ? when(c, s.date, s.part) : tr(c.l, "this week", "هذا الأسبوع");
    text = tr(
      c.l,
      `Nothing is free for ${name}${withWhom} ${w}. The next opening is ${when(c, first.date, s.part)} at ${t0.time} with ${firstWho}.`,
      `لا يوجد وقت متاح لـ${name}${withWhom} ${w}. أقرب وقت ${when(c, first.date, s.part)} الساعة ${tl("ar", t0.time)} مع ${firstWho}.`,
    );
  } else if (s.date) {
    const n = first.times.length;
    text = tr(
      c.l,
      `${name}${withWhom}, ${when(c, s.date, s.part)}: ${plural(n, "free time")}. The earliest is ${t0.time} with ${firstWho}.`,
      `${name}${withWhom}، ${when(c, s.date, s.part)}: ${n} ${n === 1 ? "وقت متاح" : "أوقات متاحة"}. أقربها ${tl("ar", t0.time)} مع ${firstWho}.`,
    );
  } else {
    text = tr(
      c.l,
      `The next free time for ${name}${withWhom} is ${when(c, first.date, s.part)} at ${t0.time} with ${firstWho}.`,
      `أقرب وقت متاح لـ${name}${withWhom} ${when(c, first.date, s.part)} الساعة ${tl("ar", t0.time)} مع ${firstWho}.`,
    );
  }

  return reply(c, text, {
    blocks: [
      timesBlock(c, tr(c.l, `Free times, ${name}`, `الأوقات المتاحة، ${name}`), tr(c.l, "Tap a time to book it.", "اضغط على وقت لحجزه."), days, (date, time, staffIds) => ({
        t: "book",
        serviceId: s.serviceId,
        date,
        time,
        staffId: s.staffId ?? staffIds[0],
      })),
    ],
    chips,
  });
}

/* ------------------------------ numbers ---------------------------- */

const RANGE_LABEL: Record<StatsRange, [string, string]> = {
  today: ["Today", "اليوم"],
  yesterday: ["Yesterday", "أمس"],
  week: ["This week", "هذا الأسبوع"],
  lastweek: ["Last week", "الأسبوع الماضي"],
  month: ["This month", "هذا الشهر"],
  lastmonth: ["Last month", "الشهر الماضي"],
};

function rangeDates(today: string, r: StatsRange): [string, string] {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const firstOfMonth = `${today.slice(0, 8)}01`;
  switch (r) {
    case "today":
      return [today, today];
    case "yesterday":
      return [addDays(today, -1), addDays(today, -1)];
    case "week":
      return [monday, today];
    case "lastweek":
      return [addDays(monday, -7), addDays(monday, -1)];
    case "month":
      return [firstOfMonth, today];
    case "lastmonth": {
      const end = addDays(firstOfMonth, -1);
      return [`${end.slice(0, 8)}01`, end];
    }
  }
}

async function stats(c: C, range: StatsRange): Promise<Reply> {
  const [from, to] = rangeDates(c.today, range);
  const st = await c.ops.businessStats({ from, to });
  const label = tr(c.l, ...RANGE_LABEL[range]);
  const span = from === to ? spanDate(c.l, from) : `${spanDate(c.l, from)} ${tr(c.l, "to", "إلى")} ${spanDate(c.l, to)}`;
  const money = formatMoney(st.takingsMinor, c.ctx.business.currency, c.l);
  const rate = st.appointments ? Math.round((st.noShows / st.appointments) * 100) : 0;
  const online = st.appointments ? Math.round((st.bookedOnline / st.appointments) * 100) : 0;

  const text = tr(
    c.l,
    `${label} (${span}): ${appts("en", st.appointments)} and ${money} in takings. ${plural(st.noShows, "no-show")}${st.appointments ? ` (${rate}%)` : ""} and ${st.cancelled} cancelled.`,
    `${label} (${span}): ${apptAr(st.appointments)} وإيرادات ${money}، ولم يحضر ${st.noShows}${st.appointments ? ` (${rate}%)` : ""}، وأُلغي ${st.cancelled}.`,
  );

  const others: StatsRange[] = (["today", "week", "lastweek", "month", "lastmonth"] as StatsRange[]).filter((r) => r !== range).slice(0, 4);
  return reply(c, text, {
    blocks: [
      {
        kind: "stats",
        title: `${label}, ${span}`,
        items: [
          { label: tr(c.l, "Appointments", "المواعيد"), value: String(st.appointments) },
          { label: tr(c.l, "Takings", "الإيرادات"), value: money, note: tr(c.l, "Paid at the visit, no-shows left out", "تُدفع عند الزيارة، بدون الغياب") },
          { label: tr(c.l, "No-shows", "لم يحضر"), value: String(st.noShows), note: st.appointments ? `${rate}%` : undefined },
          { label: tr(c.l, "Booked online", "حجز أونلاين"), value: String(st.bookedOnline), note: st.appointments ? tr(c.l, `${online}% of the total`, `${online}% من الإجمالي`) : undefined },
        ],
        top: st.topServices.map((t) => ({ label: svc(c, t.serviceId), value: String(t.count) })),
      },
    ],
    chips: others.map((r) => ({ label: tr(c.l, ...RANGE_LABEL[r]), step: { t: "stats", range: r } })),
  });
}

/* ----------------------------- customers --------------------------- */

function bookingRow(c: C, b: FoundBooking, chips?: Chip[]): Row {
  return {
    time: `${shortDate(c.l, b.date)}${c.l === "ar" ? "، " : ", "}${tl(c.l, b.start)}`,
    title: svc(c, b.serviceId),
    detail: who(c, b.staffId),
    status: b.status === "confirmed" || b.status === "held" ? undefined : b.status,
    chips,
  };
}

async function customer(c: C, s: Extract<Step, { t: "customer" }>): Promise<Reply> {
  const expect = { t: "customer" as const, then: s.then, date: s.date, part: s.part, placeholder: tr(c.l, "Name or mobile number", "الاسم أو رقم الجوال") };
  if (!s.query) {
    const text =
      s.then === "cancel"
        ? tr(c.l, "Whose appointment should I cancel? Type their name or mobile number.", "موعد مَن أُلغي؟ اكتب الاسم أو رقم الجوال.")
        : s.then === "move"
          ? tr(c.l, "Whose appointment should I move? Type their name or mobile number.", "موعد مَن أنقل؟ اكتب الاسم أو رقم الجوال.")
          : tr(c.l, "Who are you looking for? Type a name or mobile number.", "عن مَن تبحث؟ اكتب الاسم أو رقم الجوال.");
    return reply(c, text, { expect });
  }

  const people = await c.ops.findCustomer(s.query);
  if (!people.length) {
    return reply(
      c,
      tr(c.l, `No customer matches “${s.query}”. Try part of the name or the last four digits of their mobile.`, `لا يوجد عميل يطابق «${s.query}». جرّب جزءًا من الاسم أو آخر أربعة أرقام من الجوال.`),
      { expect },
    );
  }

  // One person with one upcoming visit and an action asked for: go straight to it.
  if (s.then && people.length === 1 && people[0].upcoming.length === 1) {
    const b = people[0].upcoming[0];
    return s.then === "cancel" ? cancel(c, b.bookingId) : move(c, { t: "move", bookingId: b.bookingId, date: s.date, part: s.part });
  }

  const actions = (b: FoundBooking): Chip[] => {
    const mv: Chip = { label: tr(c.l, "Move", "انقل"), step: { t: "move", bookingId: b.bookingId, date: s.date, part: s.part }, tone: "quiet" };
    const cx: Chip = { label: tr(c.l, "Cancel", "ألغِ"), step: { t: "cancel", bookingId: b.bookingId }, tone: "danger" };
    return s.then === "move" ? [mv] : s.then === "cancel" ? [cx] : [mv, cx];
  };

  let text: string;
  if (people.length === 1) {
    const p = people[0];
    const k = p.upcoming.length;
    text = k
      ? tr(c.l, `${p.name} has ${plural(k, "upcoming appointment")}.`, `لدى ${p.name} ${apptAr(k)} ${k === 1 ? "قادم" : "قادمة"}.`)
      : tr(c.l, `${p.name} has no upcoming appointments.`, `لا توجد مواعيد قادمة لـ${p.name}.`);
    if (k && s.then) text += tr(c.l, ` Which one should I ${s.then}?`, s.then === "cancel" ? " أي موعد أُلغي؟" : " أي موعد أنقل؟");
  } else {
    text = tr(c.l, `${people.length} customers match “${s.query}”.`, `${people.length} عملاء يطابقون «${s.query}».`);
  }

  const chips: Chip[] =
    people.length === 1
      ? [{ label: tr(c.l, `Book ${firstName(people[0].name)} in`, `احجز لـ${firstName(people[0].name)}`), step: { t: "book", name: people[0].name, phone: people[0].phone } }]
      : [];

  return reply(c, text, {
    blocks: [
      {
        kind: "customers",
        items: people.map((p) => ({
          name: p.name,
          phone: formatPhone(p.phone),
          upcoming: p.upcoming.slice(0, 4).map((b) => bookingRow(c, b, actions(b))),
          recent: p.recent.map((b) => bookingRow(c, b)),
          upcomingLabel: tr(c.l, "Coming up", "القادمة"),
          recentLabel: tr(c.l, "Recent visits", "زيارات سابقة"),
          noneLabel: tr(c.l, "Nothing booked ahead.", "لا مواعيد قادمة."),
        })),
      },
    ],
    chips,
  });
}

/* ------------------------------ booking ---------------------------- */

const country = (c: C) => currencyCountry[c.ctx.business.currency] ?? "AE";

async function book(c: C, s: BookStep): Promise<Reply> {
  const msgLang = s.msgLang ?? c.l;
  if (!s.serviceId) {
    return servicePicker(c, s.name ? tr(c.l, `Which service is ${s.name} coming in for?`, `ما الخدمة التي يحجزها ${s.name}؟`) : tr(c.l, "Which service?", "أي خدمة؟"), (serviceId) => ({ ...s, serviceId }));
  }
  const name = svc(c, s.serviceId);

  if (!s.time) {
    const { days, later } = await openings(c, { serviceId: s.serviceId, date: s.date, staffId: s.staffId, part: s.part });
    if (!days.length) return reply(c, tr(c.l, `Nothing is free for ${name} in the next three weeks.`, `لا يوجد وقت متاح لـ${name} في الأسابيع الثلاثة القادمة.`));
    const w = s.date ? when(c, s.date, s.part) : null;
    const text = later && w
      ? tr(c.l, `Nothing is free for ${name} ${w}. These are the next openings. Pick a time:`, `لا يوجد وقت متاح لـ${name} ${w}. هذه أقرب الأوقات، اختر وقتًا:`)
      : tr(c.l, `Pick a time for ${name}${s.name ? ` for ${s.name}` : ""}:`, `اختر وقتًا لـ${name}${s.name ? ` لـ${s.name}` : ""}:`);
    return reply(c, text, {
      blocks: [
        timesBlock(c, tr(c.l, `Free times, ${name}`, `الأوقات المتاحة، ${name}`), tr(c.l, "Tap a time to book it.", "اضغط على وقت لحجزه."), days, (date, time, staffIds) => ({
          ...s,
          date,
          time,
          staffId: s.staffId && staffIds.includes(s.staffId) ? s.staffId : staffIds[0],
        })),
      ],
      chips: s.part ? [{ label: tr(c.l, "Any time of day", "أي وقت في اليوم"), step: { ...s, part: undefined } }] : [],
    });
  }

  const date = s.date ?? (toMin(s.time) > c.nowMin ? c.today : addDays(c.today, 1));
  const [onDay] = await c.ops.findFreeTimes({ serviceId: s.serviceId, from: date, days: 1 });
  const slot = onDay?.times.find((t) => t.time === s.time);
  if (!slot) {
    const others = onDay?.times.length ? [onDay] : [];
    const text = tr(c.l, `${s.time} ${when(c, date)} isn't free for ${name}.`, `الساعة ${tl("ar", s.time)} ${when(c, date)} غير متاحة لـ${name}.`);
    if (!others.length) {
      const next = await book(c, { ...s, date: undefined, time: undefined });
      return { ...next, text: `${text} ${next.text}` };
    }
    return reply(c, `${text} ${tr(c.l, "These times are free that day:", "هذه الأوقات المتاحة في نفس اليوم:")}`, {
      blocks: [timesBlock(c, tr(c.l, `Free times, ${name}`, `الأوقات المتاحة، ${name}`), tr(c.l, "Tap a time to book it.", "اضغط على وقت لحجزه."), others, (d, time, staffIds) => ({ ...s, date: d, time, staffId: s.staffId && staffIds.includes(s.staffId) ? s.staffId : staffIds[0] }))],
    });
  }

  const staffId = s.staffId && slot.staffIds.includes(s.staffId) ? s.staffId : slot.staffIds[0];
  const swapped = s.staffId && s.staffId !== staffId ? tr(c.l, ` ${who(c, s.staffId)} is busy then, so it's with ${who(c, staffId)}.`, ` ${who(c, s.staffId)} مشغول في هذا الوقت، لذلك الموعد مع ${who(c, staffId)}.`) : "";
  const at = tr(c.l, `${name}, ${when(c, date)} at ${s.time} with ${who(c, staffId)}.`, `${name}، ${when(c, date)} الساعة ${tl("ar", s.time)} مع ${who(c, staffId)}.`);
  const settled: BookStep = { ...s, date, staffId, msgLang };

  if (!s.name || !s.phone) {
    return reply(c, `${at}${swapped} ${tr(c.l, "Who is it for?", "لمن الموعد؟")}`, { blocks: [{ kind: "contact", step: settled }] });
  }
  const phone = normalizePhone(s.phone, country(c));
  if (!phone) {
    return reply(c, tr(c.l, "That mobile number doesn't look right. Check it and try again.", "رقم الجوال غير صحيح. راجعه وحاول مرة أخرى."), {
      blocks: [{ kind: "contact", step: settled, error: errText(c.l, "bad_phone") }],
    });
  }

  const service = c.ctx.catalog.services.find((x) => x.id === s.serviceId)!;
  return reply(c, `${tr(c.l, "Here's the booking. Check it, then confirm.", "هذا هو الحجز. راجعه ثم أكّد.")}${swapped}`, {
    blocks: [
      {
        kind: "confirm",
        tone: "book",
        title: tr(c.l, "Book this appointment?", "تأكيد الحجز؟"),
        lines: [
          [tr(c.l, "Customer", "العميل"), `${s.name}, ${formatPhone(phone)}`],
          [tr(c.l, "Service", "الخدمة"), `${name}, ${formatDuration(service.durationMin, c.l)}, ${formatMoney(service.priceMinor, c.ctx.business.currency, c.l)}`],
          [tr(c.l, "When", "الموعد"), `${heading(c, date)}, ${tl(c.l, s.time)}`],
          [tr(c.l, "With", "مع"), who(c, staffId)],
        ],
        note: tr(
          c.l,
          `${firstName(s.name)} gets a WhatsApp confirmation in ${msgLang === "ar" ? "Arabic" : "English"}, with a link to change or cancel.`,
          `يصل ${firstName(s.name)} تأكيد على واتساب ${msgLang === "ar" ? "بالعربية" : "بالإنجليزية"} مع رابط للتعديل أو الإلغاء.`,
        ),
        yes: { label: tr(c.l, "Book it", "احجز"), tone: "primary", step: { t: "book.confirm", serviceId: s.serviceId, date, time: s.time, staffId, name: s.name, phone, msgLang } },
        no: { label: tr(c.l, "Don't book", "لا تحجز"), step: { t: "noop" } },
      },
    ],
  });
}

async function bookConfirm(c: C, s: Extract<Step, { t: "book.confirm" }>): Promise<Reply> {
  const r = await c.ops.bookAppointment({ serviceId: s.serviceId, date: s.date, time: s.time, staffId: s.staffId, name: s.name, phone: s.phone, language: s.msgLang });
  if (!r.ok) {
    const again = await book(c, { t: "book", serviceId: s.serviceId, date: s.date, name: s.name, phone: s.phone, msgLang: s.msgLang });
    return { ...again, text: `${errText(c.l, r.error)} ${again.text}` };
  }
  const b = r.booking;
  return reply(c, tr(c.l, "Done. It's on the schedule and the confirmation is on its way.", "تم. الموعد في الجدول والتأكيد في الطريق."), {
    blocks: [
      {
        kind: "done",
        tone: "book",
        title: tr(c.l, "Booked", "تم الحجز"),
        text: tr(
          c.l,
          `${s.name}, ${svc(c, b.serviceId)} with ${who(c, b.staffId)}, ${when(c, b.date)} at ${b.start}.`,
          `${s.name}، ${svc(c, b.serviceId)} مع ${who(c, b.staffId)}، ${when(c, b.date)} الساعة ${tl("ar", b.start)}.`,
        ),
        links: [
          { href: `/dashboard?date=${b.date}`, label: tr(c.l, "Open the day", "افتح اليوم") },
          { href: "/dashboard/messages", label: tr(c.l, "See the WhatsApp message", "شاهد رسالة واتساب") },
        ],
      },
    ],
    chips: [
      { label: tr(c.l, "Book someone else", "احجز لعميل آخر"), step: { t: "book" } },
      { label: tr(c.l, "That day's schedule", "جدول ذلك اليوم"), step: { t: "day", date: b.date } },
    ],
  });
}

/* --------------------------- cancel, move -------------------------- */

function bookingLines(c: C, b: FoundBooking): [string, string][] {
  return [
    [tr(c.l, "Customer", "العميل"), b.customer ? `${b.customer.name}, ${formatPhone(b.customer.phone)}` : tr(c.l, "Walk-in", "بدون اسم")],
    [tr(c.l, "Service", "الخدمة"), svc(c, b.serviceId)],
  ];
}

async function usable(c: C, bookingId: string): Promise<FoundBooking | Reply> {
  const b = await c.ops.getAppointment(bookingId);
  if (!b) return reply(c, errText(c.l, "not_found"));
  if (b.status !== "confirmed") {
    const st = STATUS[b.status] ?? ["not active", "غير نشط"];
    return reply(c, tr(c.l, `That appointment is marked ${st[0].toLowerCase()}, so it can't be changed here.`, `هذا الموعد مسجّل «${st[1]}»، فلا يمكن تعديله من هنا.`));
  }
  return b;
}

async function cancel(c: C, bookingId: string): Promise<Reply> {
  const b = await usable(c, bookingId);
  if ("lang" in b) return b;
  const n = b.customer ? firstName(b.customer.name) : tr(c.l, "The customer", "العميل");
  return reply(c, tr(c.l, "Check this is the right one.", "تأكد أنه الموعد الصحيح."), {
    blocks: [
      {
        kind: "confirm",
        tone: "cancel",
        title: tr(c.l, "Cancel this appointment?", "إلغاء هذا الموعد؟"),
        lines: [...bookingLines(c, b), [tr(c.l, "When", "الموعد"), `${heading(c, b.date)}, ${tl(c.l, b.start)}`], [tr(c.l, "With", "مع"), who(c, b.staffId)]],
        note: tr(c.l, `${n} gets a WhatsApp message saying it's cancelled, and the time opens up for others.`, `يصل ${n} إشعار بالإلغاء على واتساب، ويصبح الوقت متاحًا لغيره.`),
        yes: { label: tr(c.l, "Cancel it", "ألغِ الموعد"), tone: "danger", step: { t: "cancel.confirm", bookingId } },
        no: { label: tr(c.l, "Keep it", "أبقِه"), step: { t: "noop" } },
      },
    ],
  });
}

async function cancelConfirm(c: C, bookingId: string): Promise<Reply> {
  const r = await c.ops.cancelAppointment(bookingId);
  if (!r.ok) return reply(c, errText(c.l, r.error));
  const b = r.booking;
  const n = b.customer?.name ?? tr(c.l, "Walk-in", "بدون اسم");
  return reply(c, tr(c.l, "Cancelled. The time is free again.", "تم الإلغاء. الوقت متاح من جديد."), {
    blocks: [
      {
        kind: "done",
        tone: "cancel",
        title: tr(c.l, "Cancelled", "تم الإلغاء"),
        text: tr(c.l, `${n}, ${svc(c, b.serviceId)}, ${when(c, b.date)} at ${b.start}.`, `${n}، ${svc(c, b.serviceId)}، ${when(c, b.date)} الساعة ${tl("ar", b.start)}.`),
        links: [
          { href: `/dashboard?date=${b.date}`, label: tr(c.l, "Open the day", "افتح اليوم") },
          { href: "/dashboard/messages", label: tr(c.l, "See the WhatsApp message", "شاهد رسالة واتساب") },
        ],
      },
    ],
    chips: b.customer
      ? [{ label: tr(c.l, `Book ${firstName(b.customer.name)} another time`, `احجز لـ${firstName(b.customer.name)} وقتًا آخر`), step: { t: "book", serviceId: b.serviceId, name: b.customer.name, phone: b.customer.phone } }]
      : [],
  });
}

async function move(c: C, s: Extract<Step, { t: "move" }>): Promise<Reply> {
  const b = await usable(c, s.bookingId);
  if ("lang" in b) return b;
  const name = svc(c, b.serviceId);
  const n = b.customer ? firstName(b.customer.name) : tr(c.l, "the customer", "العميل");
  const pickStep = (date: string, time: string, staffIds: string[]): Step => ({ t: "move", bookingId: b.bookingId, date, time, staffId: staffIds.includes(b.staffId) ? b.staffId : staffIds[0] });

  if (!s.time) {
    const { days, later } = await openings(c, { serviceId: b.serviceId, date: s.date, part: s.part, excludeBookingId: b.bookingId, skip: { date: b.date, time: b.start } });
    const now = tr(c.l, `${n}'s ${name} is ${when(c, b.date)} at ${b.start} with ${who(c, b.staffId)}.`, `موعد ${n} (${name}) ${when(c, b.date)} الساعة ${tl("ar", b.start)} مع ${who(c, b.staffId)}.`);
    if (!days.length) return reply(c, `${now} ${tr(c.l, "There's nothing free to move it to in the next three weeks.", "لا يوجد وقت متاح لنقله إليه في الأسابيع الثلاثة القادمة.")}`);
    const ask = later && s.date ? tr(c.l, `Nothing is free ${when(c, s.date, s.part)}. These are the next openings:`, `لا يوجد وقت متاح ${when(c, s.date, s.part)}. هذه أقرب الأوقات:`) : tr(c.l, "Pick the new time:", "اختر الوقت الجديد:");
    return reply(c, `${now} ${ask}`, {
      blocks: [timesBlock(c, tr(c.l, `Free times, ${name}`, `الأوقات المتاحة، ${name}`), tr(c.l, "Tap a time to move it there.", "اضغط على وقت لنقل الموعد إليه."), days, pickStep)],
      chips: s.date ? [{ label: tr(c.l, "Any day this week", "أي يوم هذا الأسبوع"), step: { t: "move", bookingId: b.bookingId } }] : [],
    });
  }

  const date = s.date ?? (toMin(s.time) > c.nowMin ? c.today : addDays(c.today, 1));
  const [onDay] = await c.ops.findFreeTimes({ serviceId: b.serviceId, from: date, days: 1, excludeBookingId: b.bookingId });
  const slot = onDay?.times.find((t) => t.time === s.time);
  if (!slot) {
    const again = await move(c, { t: "move", bookingId: b.bookingId, date });
    return { ...again, text: `${tr(c.l, `${s.time} ${when(c, date)} isn't free.`, `الساعة ${tl("ar", s.time)} ${when(c, date)} غير متاحة.`)} ${again.text}` };
  }
  const staffId = s.staffId && slot.staffIds.includes(s.staffId) ? s.staffId : slot.staffIds.includes(b.staffId) ? b.staffId : slot.staffIds[0];
  const withLine = staffId === b.staffId ? who(c, staffId) : tr(c.l, `${who(c, staffId)} (was ${who(c, b.staffId)})`, `${who(c, staffId)} (بدلًا من ${who(c, b.staffId)})`);

  return reply(c, tr(c.l, "Here's the change. Check it, then confirm.", "هذا هو التغيير. راجعه ثم أكّد."), {
    blocks: [
      {
        kind: "confirm",
        tone: "move",
        title: tr(c.l, "Move this appointment?", "نقل هذا الموعد؟"),
        lines: [
          ...bookingLines(c, b),
          [tr(c.l, "From", "من"), `${heading(c, b.date)}, ${tl(c.l, b.start)}`],
          [tr(c.l, "To", "إلى"), `${heading(c, date)}, ${tl(c.l, s.time)}`],
          [tr(c.l, "With", "مع"), withLine],
        ],
        note: tr(c.l, `${cap(n)} gets a WhatsApp message with the new time.`, `يصل ${n} إشعار بالوقت الجديد على واتساب.`),
        yes: { label: tr(c.l, "Move it", "انقل الموعد"), tone: "primary", step: { t: "move.confirm", bookingId: b.bookingId, date, time: s.time, staffId } },
        no: { label: tr(c.l, "Leave it", "اتركه"), step: { t: "noop" } },
      },
    ],
  });
}

async function moveConfirm(c: C, s: Extract<Step, { t: "move.confirm" }>): Promise<Reply> {
  const r = await c.ops.moveAppointment({ bookingId: s.bookingId, date: s.date, time: s.time, staffId: s.staffId });
  if (!r.ok) {
    if (r.error === "slot_taken" || r.error === "not_available" || r.error === "hold_expired") {
      const again = await move(c, { t: "move", bookingId: s.bookingId, date: s.date });
      return { ...again, text: `${errText(c.l, r.error)} ${again.text}` };
    }
    return reply(c, errText(c.l, r.error));
  }
  const b = r.booking;
  const n = b.customer?.name ?? tr(c.l, "Walk-in", "بدون اسم");
  return reply(c, tr(c.l, "Moved. The customer has been told.", "تم النقل، وأُبلغ العميل."), {
    blocks: [
      {
        kind: "done",
        tone: "move",
        title: tr(c.l, "Moved", "تم النقل"),
        text: tr(
          c.l,
          `${n}, ${svc(c, b.serviceId)}, now ${when(c, b.date)} at ${b.start} with ${who(c, b.staffId)}.`,
          `${n}، ${svc(c, b.serviceId)}، أصبح ${when(c, b.date)} الساعة ${tl("ar", b.start)} مع ${who(c, b.staffId)}.`,
        ),
        links: [
          { href: `/dashboard?date=${b.date}`, label: tr(c.l, "Open the day", "افتح اليوم") },
          { href: "/dashboard/messages", label: tr(c.l, "See the WhatsApp message", "شاهد رسالة واتساب") },
        ],
      },
    ],
  });
}
