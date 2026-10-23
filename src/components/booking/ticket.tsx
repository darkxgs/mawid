"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, cn } from "@/components/ui";
import { formatDateLong, formatDuration, formatMoney, formatTime, pick, type Locale } from "@/lib/format";
import { addMinutes } from "@/lib/time";
import { copy } from "@/lib/copy";
import { mmss, type PublicBusiness, type PublicService, type PublicStaff } from "./shared";

/**
 * The appointment as a ticket that fills in while the customer chooses.
 * The same object becomes the confirmation at the end, so there is one
 * thing to look at from the first tap to the WhatsApp message.
 */
export function Ticket({
  business,
  service,
  staff,
  start,
  locale,
  hold,
  status,
  code,
  className,
  footer,
}: {
  business: PublicBusiness;
  service?: PublicService | null;
  staff?: PublicStaff | null;
  start?: string | null;
  locale: Locale;
  hold?: { expiresAt: number; now: number } | null;
  status?: "confirmed" | "cancelled" | "completed" | "no_show" | null;
  code?: string;
  className?: string;
  footer?: ReactNode;
}) {
  const t = copy(locale);
  const tz = business.timezone;
  const startDate = start ? new Date(start) : null;
  const end = startDate && service ? addMinutes(startDate, service.durationMin) : null;
  const total = business.holdMinutes * 60_000;
  const left = hold ? (hold.now ? hold.expiresAt - hold.now : total) : 0;

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] bg-ink text-white shadow-pop",
        className,
      )}
    >
      {/* faint tide lines: the only decoration, drawn once */}
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 w-full text-white/[0.05]" viewBox="0 0 400 160" preserveAspectRatio="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M0 ${40 + i * 22} C 90 ${22 + i * 22}, 170 ${62 + i * 22}, 260 ${40 + i * 22} S 360 ${24 + i * 22}, 400 ${38 + i * 22}`} stroke="currentColor" strokeWidth="1.2" fill="none" />
        ))}
      </svg>

      <div className="px-6 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[13px] text-white/60">{pick(locale, business.name, business.nameAr)}</p>
          {status ? (
            <span
              className={cn(
                "inline-flex h-6 animate-rise items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold",
                status === "confirmed" && "bg-saffron text-ink",
                status === "cancelled" && "bg-rose-soft text-rose",
                (status === "completed" || status === "no_show") && "bg-white/15 text-white",
              )}
            >
              {status === "confirmed" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
              {t.manage.status[status]}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "font-display mt-2 text-[24px] leading-tight font-medium text-balance",
            !service && "text-white/35",
          )}
        >
          {service ? pick(locale, service.name, service.nameAr) : t.ticket.choose}
        </p>
        {service ? (
          <p className="tnum mt-1.5 text-[14px] text-white/65">
            {formatDuration(service.durationMin, locale)}
            <span className="mx-2 inline-block h-3 w-px translate-y-0.5 bg-white/20" aria-hidden />
            {formatMoney(service.priceMinor, business.currency, locale)}
          </p>
        ) : null}
      </div>

      {/* perforation */}
      <div aria-hidden className="relative h-0">
        <span className="absolute -start-3 -top-3 size-6 rounded-full bg-paper" />
        <span className="absolute -end-3 -top-3 size-6 rounded-full bg-paper" />
        <span className="absolute inset-x-6 top-0 border-t border-dashed border-white/20" />
      </div>

      <dl className="grid gap-3.5 px-6 pt-5 pb-6 text-[14px]">
        <Row label={t.ticket.with}>
          {staff ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={staff.name} color={staff.color} size={22} className="ring-2 ring-ink" />
              <span className="truncate">{pick(locale, staff.name, staff.nameAr)}</span>
            </span>
          ) : service ? (
            <span className="text-white/60">{t.ticket.anyone}</span>
          ) : (
            <Blank />
          )}
        </Row>
        <Row label={t.ticket.date}>{startDate ? formatDateLong(startDate, tz, locale) : <Blank />}</Row>
        <Row label={t.ticket.time}>
          {startDate && end ? (
            <span className={cn("tnum font-medium", status === "cancelled" ? "text-white/45 line-through" : "text-saffron")}>
              {formatTime(startDate, tz, locale)}
              <span className="mx-1.5 text-white/40">–</span>
              {formatTime(end, tz, locale)}
            </span>
          ) : (
            <Blank />
          )}
        </Row>
        {code ? (
          <Row label={t.done.code}>
            <span className="tnum font-medium tracking-wide">{code}</span>
          </Row>
        ) : null}
      </dl>

      {hold && !status ? (
        <div className="flex items-center gap-3 border-t border-white/10 bg-white/[0.04] px-6 py-4">
          <HoldRing fraction={Math.max(0, left / total)} />
          <p className="text-[13px] leading-snug text-white/75">
            {left > 0 ? (
              <>
                {t.heldFor}
                <span className="tnum ms-1.5 font-semibold text-saffron">{mmss(left)}</span>
              </>
            ) : (
              t.holdOver
            )}
          </p>
        </div>
      ) : null}

      {footer ? <div className="border-t border-white/10 px-6 py-4">{footer}</div> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-3">
      <dt className="text-white/45">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Blank() {
  return <span aria-hidden className="block h-[3px] w-16 rounded-full bg-white/12" />;
}

function HoldRing({ fraction }: { fraction: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-9 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="var(--color-saffron)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}
