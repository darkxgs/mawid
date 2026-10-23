"use client";

import { CheckCheck, Mail, MessageCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClass, cn } from "@/components/ui";
import { formatTime, enDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { EmptyState, PageHeader } from "./common";

type Row = {
  id: string;
  channel: "whatsapp" | "email";
  kind: string;
  recipient: string;
  body: string;
  status: "sent" | "failed" | "simulated";
  error: string | null;
  createdAt: string;
  customerName: string | null;
};

const KIND_LABEL: Record<string, string> = {
  confirmation: "Confirmations",
  reminder_24h: "Day-before reminders",
  reminder_2h: "Same-day reminders",
  cancellation: "Cancellations",
  reschedule: "Time changes",
};

export function MessagesView({
  rows,
  total,
  week,
  kind,
  page,
  tz,
  providers,
  whatsappEnabled,
}: {
  rows: Row[];
  total: number;
  week: Partial<Record<"sent" | "failed" | "simulated", number>>;
  kind: string | null;
  page: number;
  tz: string;
  providers: { whatsapp: boolean; email: boolean };
  whatsappEnabled: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const weekTotal = (week.sent ?? 0) + (week.failed ?? 0) + (week.simulated ?? 0);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Messages"
        description="Everything Mawid sent your customers: confirmations, reminders and changes, in the language they booked in."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <FilterChip href="/dashboard/messages" active={!kind}>
              All
            </FilterChip>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <FilterChip key={k} href={`/dashboard/messages?kind=${k}`} active={kind === k}>
                {label}
              </FilterChip>
            ))}
          </div>

          {rows.length ? (
            <ul className="mt-4 divide-y divide-mist overflow-hidden rounded-panel border border-mist bg-card">
              {rows.map((m) => {
                const expanded = open === m.id;
                const when = new Date(m.createdAt);
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => setOpen(expanded ? null : m.id)} aria-expanded={expanded} className="grid w-full gap-2 px-4 py-3.5 text-start hover:bg-mist-2/40 sm:px-5">
                      <span className="flex items-center gap-2.5">
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", m.channel === "whatsapp" ? "bg-[#e7f8ee] text-[#0b7a3e]" : "bg-sea-soft text-sea-deep")}>
                          {m.channel === "whatsapp" ? <MessageCircle className="size-3.5" /> : <Mail className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">{m.customerName ?? m.recipient}</span>
                          <span className="tnum block truncate text-[12.5px] text-muted">
                            {KIND_LABEL[m.kind]?.replace(/s$/, "") ?? m.kind}, to {m.channel === "whatsapp" ? formatPhone(m.recipient) : m.recipient}
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-end text-[12.5px] text-muted">
                          {enDate(when, { day: "numeric", month: "short" }, tz)}
                          <span className="block">{formatTime(when, tz, "en")}</span>
                        </span>
                      </span>
                      <span className="ps-[38px]">
                        <span
                          dir="auto"
                          className={cn(
                            "block max-w-[520px] rounded-[14px] rounded-ss-[4px] px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line",
                            m.channel === "whatsapp" ? "bg-[#eef8e6]" : "bg-mist-2",
                            !expanded && "line-clamp-2",
                          )}
                        >
                          {m.body}
                        </span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-[12px]">
                          {m.status === "sent" ? (
                            <span className="flex items-center gap-1 text-sea">
                              <CheckCheck className="size-3.5" /> Delivered to provider
                            </span>
                          ) : m.status === "failed" ? (
                            <span className="flex items-center gap-1 text-rose">
                              <TriangleAlert className="size-3.5" /> Failed{expanded && m.error ? `: ${m.error}` : ""}
                            </span>
                          ) : (
                            <span className="text-faint">Simulated, not delivered</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-4">
              <EmptyState title="No messages yet">Messages appear here as soon as someone books.</EmptyState>
            </div>
          )}

          {total > rows.length || page > 1 ? (
            <div className="mt-4 flex justify-end gap-2">
              {page > 1 ? (
                <Link href={`/dashboard/messages?${new URLSearchParams({ ...(kind ? { kind } : {}), page: String(page - 1) })}`} className={buttonClass("outline", "sm")}>
                  Newer
                </Link>
              ) : null}
              {page * 40 < total ? (
                <Link href={`/dashboard/messages?${new URLSearchParams({ ...(kind ? { kind } : {}), page: String(page + 1) })}`} className={buttonClass("outline", "sm")}>
                  Older
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="grid content-start gap-4">
          <section className="rounded-panel border border-mist bg-card p-5">
            <p className="text-[14px] font-medium">Last 7 days</p>
            <p className="font-display tnum mt-2 text-[28px] leading-none font-semibold">{weekTotal}</p>
            <p className="mt-1 text-[13px] text-muted">messages</p>
            <dl className="mt-4 grid gap-2 text-[13.5px]">
              <div className="flex justify-between">
                <dt>Delivered</dt>
                <dd className="tnum">{week.sent ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Simulated</dt>
                <dd className="tnum">{week.simulated ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className={week.failed ? "text-rose" : ""}>Failed</dt>
                <dd className="tnum">{week.failed ?? 0}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-panel border border-mist bg-card p-5 text-[13.5px] leading-relaxed">
            <p className="text-[14px] font-medium">Delivery</p>
            <p className="mt-2 flex items-center justify-between">
              WhatsApp
              <span className={providers.whatsapp && whatsappEnabled ? "text-sea" : "text-muted"}>
                {!whatsappEnabled ? "Turned off" : providers.whatsapp ? "Connected" : "Not connected"}
              </span>
            </p>
            <p className="mt-1 flex items-center justify-between">
              Email
              <span className={providers.email ? "text-sea" : "text-muted"}>{providers.email ? "Connected" : "Not connected"}</span>
            </p>
            {!providers.whatsapp ? (
              <p className="mt-3 text-muted">
                Until WhatsApp Business is connected, messages are written here exactly as customers would get them, but not sent.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-[13px] leading-[30px] whitespace-nowrap transition-colors",
        active ? "border-ink bg-ink text-white" : "border-mist bg-card text-ink-2 hover:border-ink-2/40",
      )}
    >
      {children}
    </Link>
  );
}
