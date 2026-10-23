"use client";

import { CalendarClock, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Spinner, buttonClass, cn } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatDateShort, formatTime, type Locale } from "@/lib/format";
import { addDays, daysBetween } from "@/lib/time";
import { BusinessHeader } from "./booking-flow";
import { DayStrip } from "./day-strip";
import { SlotGrid } from "./slot-grid";
import { Ticket } from "./ticket";
import { api, useAvailability, type ApiError, type PublicBusiness, type SlotPick } from "./shared";

type ManagedBooking = {
  id: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  startsAt: string;
  serviceId: string;
  staffId: string;
  canChange: boolean;
  past: boolean;
};

const PAGE = 14;

export function ManageView({
  token,
  business,
  booking: initial,
  initialLocale,
}: {
  token: string;
  business: PublicBusiness;
  booking: ManagedBooking;
  initialLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = copy(locale);
  const [booking, setBooking] = useState(initial);
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  // Rescheduling state
  const [from, setFrom] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<SlotPick | null>(null);

  const service = business.services.find((s) => s.id === booking.serviceId) ?? null;
  const staff = business.staff.find((s) => s.id === booking.staffId) ?? null;
  const code = booking.id.replace(/^bk_?/, "").slice(-6).toUpperCase();

  const avail = useAvailability(
    mode === "move" ? `/api/m/${token}/availability?${new URLSearchParams({ days: String(PAGE), ...(from ? { from } : {}) })}` : null,
  );

  useEffect(() => {
    if (avail.status === "ready" && !from && avail.days[0]) setToday(avail.days[0].date);
  }, [avail.status, avail.days, from]);

  useEffect(() => {
    if (avail.status !== "ready" || !avail.days.length) return;
    if (date && avail.days.some((d) => d.date === date)) return;
    setDate((avail.days.find((d) => d.slots.length) ?? avail.days[0]).date);
  }, [avail.status, avail.days, date]);

  function switchLocale() {
    const next: Locale = locale === "ar" ? "en" : "ar";
    setLocale(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  }

  function fail(code: ApiError) {
    const e = t.errors;
    const text = code === "slot_taken" || code === "not_available" || code === "too_late" ? e[code] : e.generic;
    setMessage({ tone: "warn", text });
    if (code === "too_late") {
      setBooking((b) => ({ ...b, canChange: false }));
      setMode("view");
    }
  }

  async function move() {
    if (!slot) return;
    setPending(true);
    setMessage(null);
    const r = await api<{ startsAt: string; staffId: string }>(`/api/m/${token}`, {
      method: "POST",
      body: JSON.stringify({ action: "reschedule", startsAt: slot.start }),
    });
    setPending(false);
    if (!r.ok) {
      fail(r.error);
      setSlot(null);
      avail.reload();
      return;
    }
    setBooking((b) => ({ ...b, startsAt: r.data.startsAt, staffId: r.data.staffId }));
    setMode("view");
    setSlot(null);
    setMessage({ tone: "ok", text: t.manage.moved });
  }

  async function cancel() {
    setPending(true);
    setMessage(null);
    const r = await api(`/api/m/${token}`, { method: "POST", body: JSON.stringify({ action: "cancel" }) });
    setPending(false);
    if (!r.ok) return fail(r.error);
    setBooking((b) => ({ ...b, status: "cancelled", canChange: false }));
    setMode("view");
  }

  const selectedDay = avail.days.find((d) => d.date === date) ?? null;
  const nextFrom = avail.days.length ? addDays(avail.days[avail.days.length - 1].date, 1) : null;
  const canNext = !!(today && nextFrom && daysBetween(today, nextFrom) < business.maxAdvanceDays);
  const canPrev = !!(today && from && from > today);
  const active = booking.status === "confirmed" && !booking.past;

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="min-h-dvh bg-paper">
      <BusinessHeader business={business} locale={locale} t={t} onSwitch={switchLocale} />

      <main className={cn("mx-auto px-4 pt-8 pb-16 sm:px-6", mode === "move" ? "max-w-6xl" : "max-w-md")}>
        <div className={cn(mode === "move" && "grid gap-10 lg:grid-cols-[380px_minmax(0,1fr)]")}>
          <div>
            <h1 className="font-display text-[28px] leading-tight font-medium">{t.manage.title}</h1>
            <Ticket
              className="mt-6"
              business={business}
              service={service}
              staff={staff}
              start={booking.startsAt}
              locale={locale}
              status={booking.status}
              code={code}
            />

            {message ? (
              <p
                role="status"
                className={cn(
                  "mt-5 animate-rise rounded-control px-4 py-3 text-[14px]",
                  message.tone === "ok" ? "bg-sea-soft text-sea-deep" : "border border-saffron/50 bg-saffron-soft text-ink",
                )}
              >
                {message.text}
              </p>
            ) : null}

            {booking.status === "cancelled" ? (
              <div className="mt-6 grid gap-3">
                <p className="text-[15px] text-ink-2">{t.manage.cancelled}</p>
                <Link href={`/b/${business.slug}?lang=${locale}`} className={buttonClass("primary", "lg", "w-full")}>
                  {t.manage.bookAgain}
                </Link>
              </div>
            ) : !active ? (
              <div className="mt-6 grid gap-3">
                <p className="text-[15px] text-ink-2">{t.manage.past}</p>
                <Link href={`/b/${business.slug}?lang=${locale}`} className={buttonClass("primary", "lg", "w-full")}>
                  {t.manage.bookAgain}
                </Link>
              </div>
            ) : !booking.canChange ? (
              <div className="mt-6 grid gap-3">
                <p className="text-[14px] leading-relaxed text-muted">{t.manage.locked(business.cancelWindowHours)}</p>
                {business.phone ? (
                  <a href={`tel:${business.phone.replace(/\s/g, "")}`} className={buttonClass("outline", "lg", "w-full")}>
                    <Phone className="size-4" aria-hidden />
                    {t.manage.call}
                  </a>
                ) : null}
              </div>
            ) : mode === "cancel" ? (
              <div className="mt-6 animate-rise rounded-panel border border-rose/25 bg-card p-5">
                <p className="font-display text-[17px] font-medium">{t.manage.cancelAsk}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="danger" onClick={cancel} disabled={pending}>
                    {pending ? <Spinner /> : null}
                    {pending ? t.manage.cancelling : t.manage.cancelYes}
                  </Button>
                  <Button variant="ghost" onClick={() => setMode("view")} disabled={pending}>
                    {t.manage.cancelNo}
                  </Button>
                </div>
              </div>
            ) : mode === "view" ? (
              <div className="mt-6 grid gap-2.5">
                <Button size="lg" onClick={() => { setMessage(null); setMode("move"); }}>
                  <CalendarClock className="size-4" aria-hidden />
                  {t.manage.move}
                </Button>
                <Button size="lg" variant="danger" onClick={() => { setMessage(null); setMode("cancel"); }}>
                  <X className="size-4" aria-hidden />
                  {t.manage.cancel}
                </Button>
                <p className="mt-2 text-[13px] text-muted">{t.policy(business.cancelWindowHours)}</p>
              </div>
            ) : null}
          </div>

          {mode === "move" ? (
            <section aria-labelledby="move-title" className="min-w-0 lg:pt-14">
              <div className="flex items-center justify-between gap-4">
                <h2 id="move-title" className="font-display text-[22px] font-medium">
                  {t.manage.moveTitle}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => { setMode("view"); setSlot(null); }}>
                  {t.back}
                </Button>
              </div>
              <div className="mt-5">
                <DayStrip
                  days={avail.days}
                  selected={date}
                  loading={avail.status === "loading"}
                  locale={locale}
                  onSelect={(d) => {
                    setDate(d);
                    setSlot(null);
                  }}
                  onPrev={canPrev ? () => setFrom(from && today && daysBetween(today, addDays(from, -PAGE)) > 0 ? addDays(from, -PAGE) : null) : undefined}
                  onNext={canNext ? () => setFrom(nextFrom) : undefined}
                />
              </div>
              <div className="mt-6 min-h-32">
                {avail.status === "loading" && !selectedDay ? (
                  <p className="flex items-center gap-2 text-[14px] text-muted">
                    <Spinner />
                    {t.loadingTimes}
                  </p>
                ) : avail.status === "error" ? (
                  <p className="text-[14px] text-ink-2">{t.timesError}</p>
                ) : selectedDay?.slots.length ? (
                  <SlotGrid day={selectedDay} selected={slot?.start ?? null} onSelect={setSlot} locale={locale} tz={business.timezone} />
                ) : avail.status === "ready" ? (
                  <p className="rounded-panel border border-dashed border-mist p-6 text-[14px] text-ink-2">{t.noTimesDay}</p>
                ) : null}
              </div>
              <div className="sticky bottom-0 -mx-4 mt-8 flex items-center gap-4 border-t border-mist bg-paper/92 px-4 py-3 backdrop-blur-md sm:mx-0 sm:px-0 lg:border-0 lg:bg-transparent">
                <p className="tnum min-w-0 flex-1 truncate text-[15px] font-medium">
                  {slot
                    ? `${formatDateShort(new Date(slot.start), business.timezone, locale)}${locale === "ar" ? "، " : ", "}${formatTime(new Date(slot.start), business.timezone, locale)}`
                    : " "}
                </p>
                <Button size="lg" disabled={!slot || pending} onClick={move} className="min-w-40">
                  {pending ? <Spinner /> : null}
                  {pending ? t.manage.moving : t.manage.moveConfirm}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Link href="/" className="text-[13px] text-faint transition-colors hover:text-muted">
          {t.footer}
        </Link>
      </footer>
    </div>
  );
}
