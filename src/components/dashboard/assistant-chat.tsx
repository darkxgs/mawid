"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type InferUITools,
  type UIDataTypes,
  type UIMessage,
} from "ai";
import { ArrowUp, CalendarCheck, CalendarX, Check, Clock, RotateCcw, Square, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Spinner, cn } from "@/components/ui";
import type { AssistantTools } from "@/server/assistant";

type Msg = UIMessage<never, UIDataTypes, InferUITools<AssistantTools>>;
type Part = Msg["parts"][number];

const SUGGESTIONS = [
  "Who's free tomorrow afternoon for a check-up?",
  "What does Dr. Layla have today?",
  "How many no-shows did we have last week?",
  "Book Sophie Turner (050 123 4567) for whitening on the next free Thursday afternoon",
  "مين عنده مواعيد بكرة الصبح؟",
];

export function AssistantChat({ businessName }: { businessName: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, addToolApprovalResponse, status, stop, error, setMessages, regenerate } = useChat<Msg>({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, status]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    void sendMessage({ text: t });
    setInput("");
    field.current?.focus();
  }

  return (
    <div className="flex h-[calc(100dvh-37px)] flex-col max-lg:h-[calc(100dvh-140px)]">
      <div className="flex items-center justify-between gap-4 border-b border-mist px-4 py-4 sm:px-8">
        <div>
          <h1 className="font-display text-[22px] leading-tight font-semibold">Assistant</h1>
          <p className="text-[13.5px] text-muted">Ask about the diary, find free times, book, move or cancel. You approve every change.</p>
        </div>
        {messages.length ? (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={busy}>
            <RotateCcw className="size-3.5" /> New chat
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-8">
          {!messages.length ? (
            <div className="pt-6">
              <p className="font-display text-[24px] leading-snug font-semibold text-balance">What do you need at {businessName} today?</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    dir="auto"
                    className="rounded-[14px] border border-mist bg-card px-4 py-3 text-start text-[14px] leading-snug text-ink-2 transition-[border-color,transform] duration-100 hover:border-sea/50 active:scale-[0.98]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p dir="auto" className="max-w-[80%] rounded-[18px] rounded-ee-[6px] bg-ink px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-white">
                  {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                </p>
              </div>
            ) : (
              <div key={m.id} className="grid gap-3">
                {m.parts.map((p, i) => (
                  <AssistantPart key={i} part={p} onApprove={(id, approved) => addToolApprovalResponse({ id, approved })} />
                ))}
              </div>
            ),
          )}

          {status === "submitted" ? (
            <p className="flex items-center gap-2 text-[14px] text-muted">
              <Spinner /> Thinking
            </p>
          ) : null}
          {error ? (
            <div className="flex items-center gap-3 rounded-control bg-rose-soft px-4 py-3 text-[14px] text-rose">
              <span className="flex-1">{error.message || "Something went wrong."}</span>
              <Button variant="outline" size="sm" onClick={() => regenerate()}>
                Try again
              </Button>
            </div>
          ) : null}
          <div ref={end} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-mist glass px-4 py-3 sm:px-8"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[16px] border border-mist bg-card p-2 focus-within:border-sea focus-within:ring-4 focus-within:ring-sea/10">
          <textarea
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            dir="auto"
            placeholder="Ask or tell the assistant…"
            aria-label="Message"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 placeholder:text-faint focus:outline-none focus-visible:outline-none [field-sizing:content]"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} aria-label="Stop" className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-ink text-white active:scale-95">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim()}
              className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-sea text-white transition-[transform,opacity] duration-100 active:scale-95 disabled:opacity-40"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ----------------------------- parts ------------------------------ */

function AssistantPart({ part, onApprove }: { part: Part; onApprove: (id: string, approved: boolean) => void }) {
  switch (part.type) {
    case "text":
      return part.text ? <RichText text={part.text} /> : null;
    case "tool-findFreeTimes":
      if (part.state === "output-available" && part.output.days) return <FreeTimes output={{ service: part.output.service, days: part.output.days }} />;
      return <ToolStatus state={part.state} running="Checking free times" />;
    case "tool-listAppointments":
      if (part.state === "output-available") return <AppointmentList title={`${part.output.weekday} ${part.output.date}`} rows={part.output.appointments} />;
      return <ToolStatus state={part.state} running="Opening the diary" />;
    case "tool-findCustomer":
      return part.state === "output-available" ? null : <ToolStatus state={part.state} running="Looking up the customer" />;
    case "tool-businessStats":
      return part.state === "output-available" ? null : <ToolStatus state={part.state} running="Counting" />;
    case "tool-bookAppointment":
    case "tool-cancelAppointment":
    case "tool-moveAppointment":
      return <ActionCard part={part} onApprove={onApprove} />;
    default:
      return null;
  }
}

function ToolStatus({ state, running }: { state: string; running: string }) {
  if (state === "output-error") return <p className="text-[13px] text-rose">That lookup failed.</p>;
  if (state === "output-available") return null;
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted">
      <Spinner className="size-3.5" /> {running}
    </p>
  );
}

type ActionPart = Extract<Part, { type: "tool-bookAppointment" | "tool-cancelAppointment" | "tool-moveAppointment" }>;

function ActionCard({ part, onApprove }: { part: ActionPart; onApprove: (id: string, approved: boolean) => void }) {
  const kind = part.type === "tool-bookAppointment" ? "book" : part.type === "tool-cancelAppointment" ? "cancel" : "move";
  const Icon = kind === "cancel" ? CalendarX : kind === "move" ? Clock : CalendarCheck;
  const title = kind === "book" ? "Book this appointment?" : kind === "cancel" ? "Cancel this appointment?" : "Move this appointment?";
  const input = part.input as Record<string, unknown> | undefined;

  let body: ReactNode = null;
  if (input) {
    if (kind === "book") {
      body = (
        <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 text-[14px]">
          <dt className="text-muted">Customer</dt>
          <dd>
            {String(input.customerName ?? "")} <span className="tnum text-muted">{String(input.customerPhone ?? "")}</span>
          </dd>
          <dt className="text-muted">When</dt>
          <dd className="tnum">
            {String(input.date ?? "")} at {String(input.time ?? "")}
          </dd>
          <dt className="text-muted">Message</dt>
          <dd>{input.sendConfirmation === false ? "No confirmation" : `WhatsApp confirmation in ${input.language === "en" ? "English" : "Arabic"}`}</dd>
        </dl>
      );
    } else {
      body = <p className="text-[14px] leading-relaxed">{String(input.summary ?? "")}</p>;
    }
  }

  const output = part.state === "output-available" ? (part.output as { ok: boolean; error?: string; booking?: { date: string; start: string; with: string; service: string } }) : null;

  return (
    <div
      className={cn(
        "rounded-[16px] border bg-card p-4 shadow-[0_1px_2px_rgb(15_46_53/0.05)] transition-colors",
        part.state === "approval-requested" ? "border-saffron/60" : "border-mist",
      )}
    >
      <p className="flex items-center gap-2 text-[14px] font-medium">
        <Icon className={cn("size-4", kind === "cancel" ? "text-rose" : "text-sea")} />
        {output?.ok
          ? kind === "book"
            ? "Booked"
            : kind === "cancel"
              ? "Cancelled"
              : "Moved"
          : part.state === "output-denied"
            ? "Not done"
            : title}
      </p>
      <div className="mt-2.5">{body ?? <Spinner className="text-muted" />}</div>

      {part.state === "approval-requested" && !part.approval.isAutomatic ? (
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant={kind === "cancel" ? "danger" : "primary"} onClick={() => onApprove(part.approval.id, true)} className="active:scale-[0.97]">
            <Check className="size-3.5" />
            {kind === "book" ? "Book it" : kind === "cancel" ? "Cancel it" : "Move it"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onApprove(part.approval.id, false)} className="active:scale-[0.97]">
            <X className="size-3.5" /> Don&apos;t
          </Button>
        </div>
      ) : null}
      {part.state === "approval-responded" || (part.state === "input-available" && !output) ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <Spinner className="size-3.5" /> Working on it
        </p>
      ) : null}
      {output && !output.ok ? <p className="mt-3 text-[13.5px] text-rose">{output.error}</p> : null}
      {output?.ok && output.booking ? (
        <p className="mt-3 text-[13.5px] text-sea-deep">
          {output.booking.service} with {output.booking.with}, {output.booking.date} at {output.booking.start}.{" "}
          <Link href={`/dashboard?date=${output.booking.date}`} className="font-medium underline underline-offset-2">
            Open the day
          </Link>
        </p>
      ) : null}
      {part.state === "output-denied" ? <p className="mt-2 text-[13px] text-muted">You chose not to go ahead.</p> : null}
    </div>
  );
}

type FreeOutput = { service?: string; days: { date: string; weekday: string; closed: boolean; times: { time: string; free: { name: string }[] }[] }[] };

function FreeTimes({ output }: { output: FreeOutput }) {
  const days = output.days.filter((d) => d.times.length);
  if (!days.length) return <p className="text-[13.5px] text-muted">No free times found for {output.service ?? "that service"}.</p>;
  return (
    <div className="rounded-[16px] border border-mist bg-card p-4">
      <p className="text-[13px] text-muted">Free times{output.service ? ` for ${output.service}` : ""}</p>
      <div className="mt-2 grid gap-3">
        {days.slice(0, 4).map((d) => (
          <div key={d.date}>
            <p className="text-[13.5px] font-medium">
              {d.weekday} <span className="tnum text-muted">{d.date.slice(5).replace("-", "/")}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {d.times.slice(0, 12).map((t) => (
                <span key={t.time} title={t.free.map((f) => f.name).join(", ")} className="tnum rounded-[8px] border border-mist px-2 py-1 text-[13px]">
                  {t.time}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Row = { bookingId: string; start: string; end: string; service: string; with: string; status: string; customer: { name: string } | null };

function AppointmentList({ title, rows }: { title: string; rows: Row[] }) {
  if (!rows.length) return <p className="text-[13.5px] text-muted">Nothing booked on {title}.</p>;
  return (
    <div className="overflow-hidden rounded-[16px] border border-mist bg-card">
      <p className="border-b border-mist px-4 py-2.5 text-[13px] text-muted">{title}</p>
      <ul className="max-h-72 divide-y divide-mist overflow-y-auto">
        {rows.map((r) => (
          <li key={r.bookingId} className="flex items-center gap-3 px-4 py-2 text-[13.5px]">
            <span className="tnum w-12 shrink-0 font-medium">{r.start}</span>
            <span className="min-w-0 flex-1 truncate">
              {r.customer?.name}
              <span className="text-muted"> {r.service}</span>
            </span>
            <span className="shrink-0 text-[12.5px] text-muted">{r.with}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Minimal formatting for model text: paragraphs, bullet lists and **bold**. */
function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div dir="auto" className="grid gap-2 text-[14.5px] leading-relaxed">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="grid list-disc gap-1 ps-5 marker:text-faint">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((seg, i) => (seg.startsWith("**") && seg.endsWith("**") ? <strong key={i} className="font-semibold">{seg.slice(2, -2)}</strong> : seg));
}

