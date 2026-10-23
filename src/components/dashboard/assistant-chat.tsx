"use client";

import { ArrowUp, CalendarCheck, CalendarX, Check, Clock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ask } from "@/app/dashboard/assistant/actions";
import { Badge, Button, Input, cn, type StatusTone } from "@/components/ui";
import { hasArabic, type Block, type BookStep, type Chip, type Lang, type Reply, type Row, type Step } from "@/lib/assistant/types";

type Msg = { id: string; role: "user"; text: string } | { id: string; role: "assistant"; reply: Reply; used: Record<number, string> };
type Suggestion = { label: string; step?: Step };

const UI = {
  en: { more: (n: number) => `+${n} more`, top: "Most booked", messagesIn: "Messages in", name: "Name", mobile: "Mobile", next: "Continue", chose: "You chose" },
  ar: { more: (n: number) => `+${n} أخرى`, top: "الأكثر حجزًا", messagesIn: "لغة الرسائل", name: "الاسم", mobile: "الجوال", next: "متابعة", chose: "اخترت" },
};
const STATUS: Record<string, { en: string; ar: string; tone: StatusTone }> = {
  completed: { en: "Attended", ar: "حضر", tone: "completed" },
  no_show: { en: "No-show", ar: "لم يحضر", tone: "no_show" },
  cancelled: { en: "Cancelled", ar: "ملغي", tone: "cancelled" },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const nextId = () => `m${++seq}`;

export function AssistantChat({ businessName, staffName, serviceName }: { businessName: string; staffName?: string; serviceName?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const last = messages.at(-1);
  const latest = last?.role === "assistant" ? last : null;
  const expect = latest?.reply.expect;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending]);

  const suggestions: Suggestion[] = [
    { label: "What's on today?" },
    ...(serviceName ? [{ label: `Free times tomorrow afternoon for ${serviceName}` }] : []),
    ...(staffName ? [{ label: `What does ${staffName} have today?` }] : []),
    { label: "How many no-shows did we have last week?" },
    { label: "Book an appointment" },
    { label: "Find a customer", step: { t: "customer" } as Step },
    { label: "مين عنده مواعيد بكرة الصبح؟" },
  ];

  async function run(step: Step, label: string, lang: Lang) {
    if (pending) return;
    setMessages((m) => [...m, { id: nextId(), role: "user", text: label }]);
    if (step.t === "noop") {
      const reply: Reply = { lang, text: lang === "ar" ? "تمام، لم يتغير شيء." : "Okay, nothing changed.", blocks: [], chips: [] };
      setMessages((m) => [...m, { id: nextId(), role: "assistant", reply, used: {} }]);
      return;
    }
    setPending(true);
    const failed: Reply = { lang, text: lang === "ar" ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong there. Try again.", blocks: [], chips: [] };
    // A beat of "typing" so answers don't snap in before the question settles.
    const [reply] = await Promise.all([ask(step, lang).catch(() => failed), sleep(420)]);
    setMessages((m) => [...m, { id: nextId(), role: "assistant", reply, used: {} }]);
    setPending(false);
  }

  function sendTyped(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || pending) return;
    const lang: Lang = hasArabic(text) ? "ar" : expect ? (latest?.reply.lang ?? "en") : "en";
    const step: Step = expect ? { t: "text", text, expect: { then: expect.then, date: expect.date, part: expect.part } } : { t: "text", text };
    setInput("");
    void run(step, text, lang);
    field.current?.focus();
  }

  function use(msgId: string, block: number, choice: string) {
    setMessages((m) => m.map((x) => (x.id === msgId && x.role === "assistant" ? { ...x, used: { ...x.used, [block]: choice } } : x)));
  }

  return (
    <div className="flex h-[calc(100dvh-37px)] flex-col max-lg:h-[calc(100dvh-140px)]">
      <div className="flex items-center justify-between gap-4 border-b border-mist px-4 py-4 sm:px-8">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] leading-tight font-semibold">Assistant</h1>
          <p className="text-[13.5px] text-muted">Quick answers from the live schedule, in English or Arabic. Nothing changes until you confirm.</p>
        </div>
        {messages.length ? (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={pending} className="shrink-0 whitespace-nowrap">
            <RotateCcw className="size-3.5" /> New chat
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-8">
          {!messages.length ? (
            <div className="pt-6">
              <p className="font-display text-[24px] leading-snug font-semibold text-balance">What do you need at {businessName} today?</p>
              <p className="mt-1.5 text-[14.5px] text-muted">Pick one, or type your own question.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void run(s.step ?? { t: "text", text: s.label }, s.label, hasArabic(s.label) ? "ar" : "en")}
                    dir="auto"
                    className="rounded-[14px] border border-mist bg-card px-4 py-3 text-start text-[14px] leading-snug text-ink-2 transition-[border-color,transform] duration-100 hover:border-sea/50 active:scale-[0.98]"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p dir="auto" className="max-w-[80%] rounded-[18px] rounded-ee-[6px] bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-white">
                  {m.text}
                </p>
              </div>
            ) : (
              <Answer
                key={m.id}
                msg={m}
                live={m === latest && !pending}
                onStep={(step, label) => void run(step, label, m.reply.lang)}
                onUse={(block, choice) => use(m.id, block, choice)}
              />
            ),
          )}

          {pending ? (
            <div aria-live="polite" className="flex items-center gap-1.5 py-2" aria-label="Looking that up">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-2/50 motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </div>
          ) : null}
          <div ref={end} />
        </div>
      </div>

      <form onSubmit={sendTyped} className="border-t border-mist glass px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[16px] border border-mist bg-card p-2 focus-within:border-sea focus-within:ring-4 focus-within:ring-sea/10">
          <textarea
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendTyped();
              }
            }}
            rows={1}
            dir="auto"
            placeholder={expect?.placeholder ?? "Ask about today, free times or a customer…"}
            aria-label="Message"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 placeholder:text-faint focus:outline-none focus-visible:outline-none [field-sizing:content]"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || pending}
            className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-sea text-white transition-[transform,opacity] duration-100 active:scale-95 disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ answer ----------------------------- */

function Answer({
  msg,
  live,
  onStep,
  onUse,
}: {
  msg: Extract<Msg, { role: "assistant" }>;
  live: boolean;
  onStep: (step: Step, label: string) => void;
  onUse: (block: number, choice: string) => void;
}) {
  const { reply } = msg;
  const l = reply.lang;
  return (
    <div dir={l === "ar" ? "rtl" : "ltr"} lang={l} className="grid animate-rise gap-3">
      <p className="text-[14.5px] leading-relaxed text-ink">{reply.text}</p>
      {reply.blocks.map((b, i) => (
        <BlockView key={i} block={b} lang={l} live={live} used={msg.used[i]} onStep={onStep} onUse={(choice) => onUse(i, choice)} />
      ))}
      {reply.chips.length && live ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {reply.chips.map((c) => (
            <ChipButton key={c.label} chip={c} onClick={() => onStep(c.step, c.label)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChipButton({ chip, onClick, disabled, small }: { chip: Chip; onClick: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border transition-[background-color,border-color,transform] duration-100 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        small ? "h-7 px-3 text-[12.5px]" : "h-8 px-3.5 text-[13px]",
        chip.tone === "danger" ? "border-rose/30 text-rose hover:bg-rose-soft" : "border-mist bg-card text-ink-2 hover:border-sea/50 hover:text-ink",
      )}
    >
      {chip.label}
    </button>
  );
}

function BlockView({
  block,
  lang,
  live,
  used,
  onStep,
  onUse,
}: {
  block: Block;
  lang: Lang;
  live: boolean;
  used?: string;
  onStep: (step: Step, label: string) => void;
  onUse: (choice: string) => void;
}) {
  const ui = UI[lang];
  switch (block.kind) {
    case "times":
      return (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-medium text-ink-2">{block.title}</p>
            {block.hint && live ? <p className="text-[12.5px] text-muted">{block.hint}</p> : null}
          </div>
          <div className="mt-3 grid gap-4">
            {block.days.map((d) => (
              <div key={d.date}>
                <p className="text-[13.5px] font-medium">{d.label}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.times.map((t) => (
                    <button
                      key={t.time}
                      type="button"
                      title={t.who}
                      disabled={!live || !t.step}
                      onClick={() => t.step && onStep(t.step, `${d.label}, ${t.label}`)}
                      className="h-9 min-w-[64px] rounded-[9px] border border-mist bg-card px-2.5 text-[13.5px] whitespace-nowrap transition-[background-color,border-color,color,transform] duration-100 hover:border-ink hover:bg-ink hover:text-white active:scale-[0.96] disabled:pointer-events-none"
                    >
                      {t.label}
                    </button>
                  ))}
                  {d.more ? <span className="self-center px-1 text-[12.5px] text-muted">{ui.more(d.more)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      );

    case "list":
      return (
        <Card flush>
          <div className="flex items-center justify-between gap-3 border-b border-mist px-4 py-2.5">
            <p className="text-[13px] font-medium text-ink-2">{block.title}</p>
            {block.href ? (
              <Link href={block.href} className="shrink-0 text-[12.5px] font-medium text-sea-deep underline-offset-2 hover:underline">
                {block.linkLabel}
              </Link>
            ) : null}
          </div>
          <ul className="divide-y divide-mist sm:max-h-80 sm:overflow-y-auto">
            {block.rows.map((r, i) => (
              <RowView key={i} row={r} lang={lang} />
            ))}
          </ul>
        </Card>
      );

    case "stats":
      return (
        <Card>
          <p className="text-[13px] font-medium text-ink-2">{block.title}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            {block.items.map((it) => (
              <div key={it.label} className="min-w-0">
                <dt className="text-[12.5px] text-muted">{it.label}</dt>
                <dd className="font-display mt-0.5 text-[22px] leading-tight font-semibold">{it.value}</dd>
                {it.note ? <dd className="mt-0.5 text-[12px] leading-snug text-muted">{it.note}</dd> : null}
              </div>
            ))}
          </dl>
          {block.top?.length ? (
            <div className="mt-4 border-t border-mist pt-3">
              <p className="text-[12.5px] text-muted">{ui.top}</p>
              <ul className="mt-1.5 grid gap-1">
                {block.top.map((t) => (
                  <li key={t.label} className="flex justify-between gap-3 text-[13.5px]">
                    <span className="truncate">{t.label}</span>
                    <span className="text-ink-2">{t.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      );

    case "customers":
      return (
        <div className="grid gap-3">
          {block.items.map((p) => (
            <Card key={p.name + p.phone} flush>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-mist px-4 py-3">
                <p className="text-[15px] font-medium">{p.name}</p>
                <p dir="ltr" className="text-[13px] text-muted">
                  {p.phone}
                </p>
              </div>
              <div className="px-4 pt-2.5 pb-1 text-[12.5px] text-muted">{p.upcomingLabel}</div>
              {p.upcoming.length ? (
                <ul className="divide-y divide-mist">
                  {p.upcoming.map((r, i) => (
                    <RowView key={i} row={r} lang={lang} live={live} onStep={onStep} wide />
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-3 text-[13.5px] text-ink-2">{p.noneLabel}</p>
              )}
              {p.recent.length ? (
                <>
                  <div className="border-t border-mist px-4 pt-2.5 pb-1 text-[12.5px] text-muted">{p.recentLabel}</div>
                  <ul className="divide-y divide-mist pb-1">
                    {p.recent.map((r, i) => (
                      <RowView key={i} row={r} lang={lang} muted wide />
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          ))}
        </div>
      );

    case "confirm": {
      const Icon = block.tone === "cancel" ? CalendarX : block.tone === "move" ? Clock : CalendarCheck;
      const open = live && !used;
      return (
        <div className={cn("rounded-[16px] border bg-card p-4 transition-colors", open ? "border-saffron/70" : "border-mist")}>
          <p className="flex items-center gap-2 text-[14.5px] font-medium">
            <Icon className={cn("size-4", block.tone === "cancel" ? "text-rose" : "text-sea")} />
            {block.title}
          </p>
          <dl className="mt-3 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-[14px]">
            {block.lines.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
          {block.note ? <p className="mt-3 text-[13px] leading-relaxed text-muted">{block.note}</p> : null}
          {open ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={block.yes.tone === "danger" ? "danger" : "primary"}
                onClick={() => {
                  onUse(block.yes.label);
                  onStep(block.yes.step, block.yes.label);
                }}
              >
                <Check className="size-3.5" />
                {block.yes.label}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onUse(block.no.label);
                  onStep(block.no.step, block.no.label);
                }}
              >
                {block.no.label}
              </Button>
            </div>
          ) : used ? (
            <p className="mt-3 text-[12.5px] text-muted">
              {ui.chose}: {used}
            </p>
          ) : null}
        </div>
      );
    }

    case "contact":
      return live && !used ? (
        <ContactForm
          block={block}
          lang={lang}
          onSubmit={(step, label) => {
            onUse(label);
            onStep(step, label);
          }}
        />
      ) : null;

    case "done": {
      const Icon = block.tone === "cancel" ? CalendarX : block.tone === "move" ? Clock : CalendarCheck;
      return (
        <div className={cn("rounded-[16px] border p-4", block.tone === "cancel" ? "border-mist bg-card" : "border-sea/25 bg-sea-soft")}>
          <p className="flex items-center gap-2 text-[14.5px] font-medium">
            <Icon className={cn("size-4", block.tone === "cancel" ? "text-ink-2" : "text-sea-deep")} />
            {block.title}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed">{block.text}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {block.links.map((a) => (
              <Link key={a.href} href={a.href} className="text-[13px] font-medium text-sea-deep underline underline-offset-2">
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      );
    }
  }
}

function Card({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return <div className={cn("overflow-hidden rounded-[16px] border border-mist bg-card", !flush && "p-4")}>{children}</div>;
}

function RowView({
  row,
  lang,
  live,
  onStep,
  muted,
  wide,
}: {
  row: Row;
  lang: Lang;
  live?: boolean;
  onStep?: (step: Step, label: string) => void;
  muted?: boolean;
  /** Rows whose time includes the date need a wider first column. */
  wide?: boolean;
}) {
  const st = row.status ? STATUS[row.status] : null;
  const end = st || row.chips?.length;
  return (
    <li
      className={cn(
        "grid items-center gap-x-3 px-4 py-2.5 text-[13.5px]",
        wide ? "grid-cols-[1fr_auto] sm:grid-cols-[148px_1fr_auto]" : "grid-cols-[52px_1fr_auto]",
        muted && "text-ink-2",
      )}
    >
      <span className={cn("font-medium whitespace-nowrap", wide && "max-sm:col-span-2 max-sm:text-[12.5px] max-sm:text-muted")}>{row.time}</span>
      <span className="min-w-0">
        <span className="block truncate">{row.title}</span>
        <span className="block truncate text-[12.5px] text-muted">
          {row.detail}
          {row.who ? `${lang === "ar" ? "، " : ", "}${row.who}` : ""}
        </span>
      </span>
      {end ? (
        <span className="flex shrink-0 items-center gap-1.5">
          {st ? <Badge tone={st.tone}>{st[lang]}</Badge> : null}
          {row.chips?.map((c) => (
            <ChipButton key={c.label} chip={c} small disabled={!live} onClick={() => onStep?.(c.step, `${c.label}: ${row.title}, ${row.time}`)} />
          ))}
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

function ContactForm({ block, lang, onSubmit }: { block: Extract<Block, { kind: "contact" }>; lang: Lang; onSubmit: (step: BookStep, label: string) => void }) {
  const ui = UI[lang];
  const [name, setName] = useState(block.step.name ?? "");
  const [phone, setPhone] = useState(block.step.phone ?? "");
  const [msgLang, setMsgLang] = useState<Lang>(block.step.msgLang ?? lang);
  const ok = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSubmit({ ...block.step, name: name.trim(), phone: phone.trim(), msgLang }, `${name.trim()}, ${phone.trim()}`);
      }}
      className="grid gap-3 rounded-[16px] border border-mist bg-card p-4 sm:grid-cols-2"
    >
      <label className="grid gap-1 text-[12.5px] text-muted">
        {ui.name}
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus className="h-10 text-[14.5px] text-ink" />
      </label>
      <label className="grid gap-1 text-[12.5px] text-muted">
        {ui.mobile}
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          inputMode="tel"
          autoComplete="off"
          placeholder="050 123 4567"
          aria-invalid={block.error ? true : undefined}
          className="h-10 text-[14.5px] text-ink"
        />
      </label>
      {block.error ? <p className="text-[13px] text-rose sm:col-span-2">{block.error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          {ui.messagesIn}
          <span className="inline-flex rounded-[9px] bg-mist-2 p-0.5">
            {(["ar", "en"] as const).map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={msgLang === x}
                onClick={() => setMsgLang(x)}
                className={cn("h-7 rounded-[7px] px-2.5 text-[12.5px] transition-colors", msgLang === x ? "bg-card text-ink shadow-[0_1px_2px_rgb(15_46_53/0.12)]" : "text-ink-2")}
              >
                {x === "ar" ? "العربية" : "English"}
              </button>
            ))}
          </span>
        </div>
        <Button type="submit" size="sm" disabled={!ok}>
          {ui.next}
        </Button>
      </div>
    </form>
  );
}
