// Shared between the chat UI and the server. Everything here is plain data,
// so a reply can travel through a server action and render on the client.

export type Lang = "en" | "ar";
export type DayPart = "morning" | "afternoon" | "evening";
export type StatsRange = "today" | "yesterday" | "week" | "lastweek" | "month" | "lastmonth";

/** Local start-time windows, in minutes after midnight. */
export const PART_WINDOW: Record<DayPart, [number, number]> = {
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 24 * 60],
};

export type BookStep = {
  t: "book";
  serviceId?: string;
  date?: string;
  time?: string;
  staffId?: string;
  part?: DayPart;
  name?: string;
  phone?: string;
  /** Language of the customer's WhatsApp messages. */
  msgLang?: Lang;
};

/**
 * What the assistant is asked to do. Free text is turned into one of these by
 * `understand()`; buttons in a reply carry them directly.
 */
export type Step =
  | { t: "text"; text: string; expect?: { then?: "cancel" | "move"; date?: string; part?: DayPart } }
  | { t: "help" }
  | { t: "noop" }
  | { t: "day"; date: string; staffId?: string; part?: DayPart }
  | { t: "free"; serviceId?: string; date?: string; staffId?: string; part?: DayPart }
  | { t: "stats"; range: StatsRange }
  | { t: "customer"; query?: string; then?: "cancel" | "move"; date?: string; part?: DayPart }
  | BookStep
  | { t: "book.confirm"; serviceId: string; date: string; time: string; staffId?: string; name: string; phone: string; msgLang: Lang }
  | { t: "cancel"; bookingId: string }
  | { t: "cancel.confirm"; bookingId: string }
  | { t: "move"; bookingId: string; date?: string; time?: string; staffId?: string; part?: DayPart }
  | { t: "move.confirm"; bookingId: string; date: string; time: string; staffId?: string };

export type Chip = { label: string; step: Step; tone?: "primary" | "danger" | "quiet" };

export type Row = {
  time: string;
  title: string;
  detail: string;
  who?: string;
  status?: "confirmed" | "completed" | "cancelled" | "no_show";
  chips?: Chip[];
};

export type Block =
  | {
      kind: "times";
      title: string;
      hint?: string;
      days: { date: string; label: string; more: number; times: { time: string; label: string; who: string; step?: Step }[] }[];
    }
  | { kind: "list"; title: string; rows: Row[]; href?: string; linkLabel?: string }
  | { kind: "stats"; title: string; items: { label: string; value: string; note?: string }[]; top?: { label: string; value: string }[] }
  | {
      kind: "customers";
      items: { name: string; phone: string; upcoming: Row[]; recent: Row[]; upcomingLabel: string; recentLabel: string; noneLabel: string }[];
    }
  | { kind: "confirm"; tone: "book" | "cancel" | "move"; title: string; lines: [string, string][]; note?: string; yes: Chip; no: Chip }
  | { kind: "contact"; step: BookStep; error?: string }
  | { kind: "done"; tone: "book" | "cancel" | "move"; title: string; text: string; links: { href: string; label: string }[] };

export type Reply = {
  lang: Lang;
  text: string;
  blocks: Block[];
  chips: Chip[];
  /** When set, the next thing typed is read as this lookup instead of a new question. */
  expect?: { t: "customer"; then?: "cancel" | "move"; date?: string; part?: DayPart; placeholder: string };
};

export const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
