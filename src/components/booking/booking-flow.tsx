"use client";

import { Check, CalendarPlus, MapPin, Phone, RotateCcw, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { Avatar, Button, Field, Input, Spinner, Textarea, buttonClass, cn } from "@/components/ui";
import { copy, type Copy } from "@/lib/copy";
import { formatDateShort, formatDuration, formatMoney, formatTime, intlTag, pick, type Locale } from "@/lib/format";
import { buildIcs, downloadIcs, googleCalendarUrl } from "@/lib/ics";
import { isOptimizable } from "@/lib/media";
import { currencyCountry, dialCode, formatPhone, normalizePhone } from "@/lib/phone";
import { addDays, addMinutes, daysBetween } from "@/lib/time";
import { DayStrip } from "./day-strip";
import { SlotGrid } from "./slot-grid";
import { Ticket } from "./ticket";
import {
  api,
  formatCalendarDate,
  useAvailability,
  useNow,
  type ApiError,
  type PublicBusiness,
  type PublicService,
  type PublicStaff,
  type SlotPick,
} from "./shared";

type Step = "service" | "time" | "details" | "done";
type Hold = { bookingId: string; token: string; staffId: string; expiresAt: number };
type Result = { manageToken: string; startsAt: string; staffId: string; phone: string; bookingId: string };

const PAGE = 14;

export function BookingFlow({
  business,
  today,
  initialLocale,
  initialServiceId,
}: {
  business: PublicBusiness;
  /** Today's date in the business's time zone, from the server. */
  today: string;
  initialLocale: Locale;
  initialServiceId?: string;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = copy(locale);
  const initialService = business.services.find((s) => s.id === initialServiceId) ?? null;

  const [step, setStep] = useState<Step>(initialService ? "time" : "service");
  const [serviceId, setServiceId] = useState<string | null>(initialService?.id ?? null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slotChoice, setSlot] = useState<SlotPick | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const service = business.services.find((s) => s.id === serviceId) ?? null;
  const eligible = useMemo(
    () => business.staff.filter((s) => (serviceId ? s.serviceIds.includes(serviceId) : false)),
    [business.staff, serviceId],
  );

  const availUrl =
    serviceId && step !== "service"
      ? `/api/b/${business.slug}/availability?${new URLSearchParams({
          service: serviceId,
          days: String(PAGE),
          ...(staffId ? { staff: staffId } : {}),
          ...(from ? { from } : {}),
        })}`
      : null;
  const avail = useAvailability(step === "time" ? availUrl : null);

  // The day in view: the one picked, or the first with free times on this page.
  const dayInView =
    date && avail.days.some((d) => d.date === date) ? date : ((avail.days.find((d) => d.slots.length) ?? avail.days[0])?.date ?? null);
  // A picked time that a refresh no longer offers is treated as not picked.
  const slot =
    slotChoice && step === "time" && avail.status === "ready" && !avail.days.some((d) => d.slots.some((x) => x.start === slotChoice.start))
      ? null
      : slotChoice;
  const assignedStaffId = result?.staffId ?? hold?.staffId ?? staffId ?? (slot?.staffIds.length === 1 ? slot.staffIds[0] : null);
  const assignedStaff = business.staff.find((s) => s.id === assignedStaffId) ?? null;

  const go = useCallback((s: Step) => {
    setStep(s);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  function switchLocale() {
    const next: Locale = locale === "ar" ? "en" : "ar";
    setLocale(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  }

  function releaseHold() {
    if (!hold) return;
    void fetch(`/api/b/${business.slug}/release`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: hold.bookingId, token: hold.token }),
    }).catch(() => {});
    setHold(null);
  }

  function chooseService(s: PublicService) {
    if (s.id !== serviceId) {
      setServiceId(s.id);
      if (staffId && !business.staff.find((x) => x.id === staffId)?.serviceIds.includes(s.id)) setStaffId(null);
      setSlot(null);
      setDate(null);
      setFrom(null);
    }
    setNotice(null);
    go("time");
  }

  function chooseStaff(id: string | null) {
    setStaffId(id);
    setSlot(null);
  }

  function errorText(code: ApiError) {
    const e = t.errors;
    if (code === "slot_taken" || code === "not_available" || code === "hold_expired" || code === "too_late") return e[code];
    return e.generic;
  }

  async function continueToDetails() {
    if (!service || !slot) return;
    setBusy(true);
    setNotice(null);
    releaseHold();
    const r = await api<{ bookingId: string; token: string; staffId: string; expiresAt: string }>(
      `/api/b/${business.slug}/hold`,
      { method: "POST", body: JSON.stringify({ serviceId: service.id, staffId, startsAt: slot.start, locale }) },
    );
    setBusy(false);
    if (!r.ok) {
      setNotice(errorText(r.error));
      setSlot(null);
      avail.reload();
      return;
    }
    setHold({ ...r.data, expiresAt: Date.parse(r.data.expiresAt) });
    go("details");
  }

  function onConflict(code: ApiError) {
    setNotice(errorText(code));
    setHold(null);
    setSlot(null);
    go("time");
    avail.reload();
  }

  const nextFrom = avail.days.length ? addDays(avail.days[avail.days.length - 1].date, 1) : null;
  const canNext = !!(nextFrom && daysBetween(today, nextFrom) < business.maxAdvanceDays);
  const canPrev = !!(from && from > today);

  const selectedDay = avail.days.find((d) => d.date === dayInView) ?? null;
  const nextOpenDay = selectedDay && !selectedDay.slots.length ? avail.days.find((d) => d.date > selectedDay.date && d.slots.length) : null;

  const ticket: TicketProps = {
    business,
    service,
    staff: assignedStaff,
    start: result?.startsAt ?? slot?.start ?? null,
    locale,
  };

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="min-h-dvh bg-paper">
      <BusinessHeader business={business} locale={locale} t={t} onSwitch={switchLocale} />

      <div ref={top} className="scroll-mt-4" />
      {step === "done" && result && service ? (
        <DoneView
          business={business}
          service={service}
          staff={assignedStaff}
          result={result}
          locale={locale}
          t={t}
          onAnother={() => {
            setResult(null);
            setSlot(null);
            setHold(null);
            setServiceId(null);
            setStaffId(null);
            setDate(null);
            setFrom(null);
            go("service");
          }}
        />
      ) : (
        <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
          <div className="min-w-0">
            <StepBar
              step={step}
              t={t}
              canGo={(s) => (s === "service" ? true : s === "time" ? !!service : false)}
              onGo={(s) => go(s)}
            />

            {notice ? (
              <div role="alert" className="mt-5 animate-rise rounded-control border border-saffron/50 bg-saffron-soft px-4 py-3 text-[14px] text-ink">
                {notice}
              </div>
            ) : null}

            {step === "service" ? (
              <ServiceStep business={business} locale={locale} t={t} selected={serviceId} onPick={chooseService} />
            ) : null}

            {step === "time" && service ? (
              <section className="mt-7" aria-labelledby="time-title">
                <h1 id="time-title" className="font-display text-[26px] leading-tight font-semibold sm:text-[30px]">
                  {t.timeTitle}
                </h1>

                {eligible.length > 1 ? (
                  <div className="mt-6">
                    <p className="mb-2.5 text-[14px] text-ink-2">{t.staffTitle}</p>
                    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                      <StaffChip active={!staffId} onClick={() => chooseStaff(null)} label={t.anyone} hint={t.anyoneHint} />
                      {eligible.map((s) => (
                        <StaffChip
                          key={s.id}
                          active={staffId === s.id}
                          onClick={() => chooseStaff(s.id)}
                          label={pick(locale, s.name, s.nameAr)}
                          hint={pick(locale, s.title ?? "", s.titleAr)}
                          staff={s}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-7">
                  <DayStrip
                    days={avail.days}
                    selected={dayInView}
                    loading={avail.status === "loading"}
                    locale={locale}
                    onSelect={(d) => {
                      setDate(d);
                      setSlot(null);
                    }}
                    onPrev={canPrev ? () => setFrom(from && daysBetween(today, addDays(from, -PAGE)) > 0 ? addDays(from, -PAGE) : null) : undefined}
                    onNext={canNext ? () => setFrom(nextFrom) : undefined}
                  />
                </div>

                <div className="mt-6 min-h-40">
                  {avail.status === "error" ? (
                    <div className="rounded-panel border border-mist bg-card p-5 text-[14px] text-ink-2">
                      <p>{t.timesError}</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={avail.reload}>
                        <RotateCcw className="size-3.5" aria-hidden />
                        {t.retry}
                      </Button>
                    </div>
                  ) : avail.status === "loading" && !selectedDay ? (
                    <p className="flex items-center gap-2 text-[14px] text-muted">
                      <Spinner />
                      {t.loadingTimes}
                    </p>
                  ) : selectedDay && selectedDay.slots.length ? (
                    <div className={cn("transition-opacity", avail.status === "loading" && "opacity-50")}>
                      <SlotGrid day={selectedDay} selected={slot?.start ?? null} onSelect={setSlot} locale={locale} tz={business.timezone} />
                    </div>
                  ) : avail.status === "ready" ? (
                    <div className="rounded-panel border border-dashed border-mist p-6 text-[14px] text-ink-2">
                      <p>{avail.days.some((d) => d.slots.length) ? t.noTimesDay : t.noTimesRange}</p>
                      {nextOpenDay ? (
                        <button type="button" onClick={() => setDate(nextOpenDay.date)} className="mt-2 font-medium text-sea underline-offset-4 hover:underline">
                          {t.nextFree(formatCalendarDate(nextOpenDay.date, intlTag(locale), { weekday: "long", day: "numeric", month: "long" }))}
                        </button>
                      ) : canNext ? (
                        <button type="button" onClick={() => setFrom(nextFrom)} className="mt-2 font-medium text-sea underline-offset-4 hover:underline">
                          {t.later}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-mist glass px-4 py-3 sm:mx-0 sm:rounded-b-panel sm:px-0 lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1 lg:hidden">
                      <p className="truncate text-[13px] text-muted">{pick(locale, service.name, service.nameAr)}</p>
                      <p className="tnum truncate text-[15px] font-medium">
                        {slot
                          ? `${formatDateShort(new Date(slot.start), business.timezone, locale)}${locale === "ar" ? "، " : ", "}${formatTime(new Date(slot.start), business.timezone, locale)}`
                          : " "}
                      </p>
                    </div>
                    <Button size="lg" className="min-w-36 lg:ms-auto" disabled={!slot || busy} onClick={continueToDetails}>
                      {busy ? <Spinner /> : null}
                      {busy ? t.holding : t.continue}
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {step === "details" && service && hold && slot ? (
              <DetailsStep
                business={business}
                t={t}
                hold={hold}
                ticket={ticket}
                onBack={() => {
                  releaseHold();
                  go("time");
                }}
                onConflict={onConflict}
                onDone={(r) => {
                  setResult({ ...r, bookingId: hold.bookingId });
                  setHold(null);
                  go("done");
                }}
              />
            ) : null}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <LiveTicket {...ticket} holdUntil={step === "details" ? hold?.expiresAt : undefined} />
              <p className="mt-4 px-2 text-[13px] leading-relaxed text-muted">{t.policy(business.cancelWindowHours)}</p>
            </div>
          </aside>
        </main>
      )}

      <footer className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Link href="/" className="text-[13px] text-faint transition-colors hover:text-muted">
          {t.footer}
        </Link>
      </footer>
    </div>
  );
}

type TicketProps = ComponentProps<typeof Ticket>;

/** The ticket, re-rendered every second only while a hold is counting down. */
function LiveTicket({ holdUntil, ...props }: TicketProps & { holdUntil?: number }) {
  const now = useNow(holdUntil !== undefined);
  return <Ticket {...props} hold={holdUntil !== undefined ? { expiresAt: holdUntil, now } : null} />;
}

export function BusinessHeader({ business, locale, t, onSwitch }: { business: PublicBusiness; locale: Locale; t: Copy; onSwitch: () => void }) {
  const name = pick(locale, business.name, business.nameAr);
  const address = pick(locale, business.address ?? "", business.addressAr);
  const tagline = pick(locale, business.tagline ?? "", business.taglineAr);
  const toggle = (
    <button
      type="button"
      onClick={onSwitch}
      aria-label={t.langSwitchLabel}
      lang={locale === "ar" ? "en" : "ar"}
      className={cn(
        "h-9 shrink-0 rounded-full px-4 text-[13.5px] font-medium transition-[background-color,transform] active:scale-[0.97]",
        business.coverUrl ? "glass-dark text-white" : "border border-mist bg-card text-ink hover:bg-mist-2",
      )}
    >
      {t.langSwitch}
    </button>
  );
  return (
    <header>
      {business.coverUrl ? (
        <div className="relative h-36 overflow-hidden bg-[#d9d4cb] sm:h-52">
          <Image
            src={business.coverUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            unoptimized={!isOptimizable(business.coverUrl)}
            className="object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(11_33_38/0.35),transparent_45%)]" />
          <div className="absolute inset-x-0 top-0 mx-auto flex max-w-6xl justify-end px-4 pt-4 sm:px-6">{toggle}</div>
        </div>
      ) : null}
      <div className={cn("mx-auto flex max-w-6xl items-start gap-4 px-4 sm:px-6", !business.coverUrl && "pt-6")}>
        {/* Only the mark overlaps the photo; the name stays on the page for contrast. */}
        <span
          aria-hidden
          className={cn(
            "font-display relative grid size-16 shrink-0 place-items-center rounded-[12px] bg-sea-deep text-[26px] font-bold text-white ring-4 ring-paper",
            business.coverUrl && "-mt-8",
          )}
        >
          {business.name.trim()[0]}
        </span>
        <div className={cn("min-w-0 flex-1", business.coverUrl ? "pt-3" : "pt-1")}>
          <p className="font-display truncate text-[20px] leading-tight font-semibold sm:text-[24px]">{name}</p>
          {tagline ? <p className="truncate text-[14px] text-muted">{tagline}</p> : null}
        </div>
        {business.coverUrl ? null : toggle}
      </div>
      {address || business.phone ? (
        <div className="mx-auto mt-3 flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 text-[13px] text-ink-2 sm:px-6">
          {address ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address ?? address)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-sea"
            >
              <MapPin className="size-3.5 text-faint" aria-hidden />
              {address}
            </a>
          ) : null}
          {business.phone ? (
            <a href={`tel:${business.phone.replace(/\s/g, "")}`} className="tnum inline-flex items-center gap-1.5 hover:text-sea" dir="ltr">
              <Phone className="size-3.5 text-faint" aria-hidden />
              {business.phone}
            </a>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

function StepBar({ step, t, canGo, onGo }: { step: Step; t: Copy; canGo: (s: Step) => boolean; onGo: (s: Step) => void }) {
  const order: Exclude<Step, "done">[] = ["service", "time", "details"];
  const idx = order.indexOf(step as Exclude<Step, "done">);
  return (
    <nav aria-label={t.stepLabel(idx + 1, order.length)} className="mt-6">
      <ol className="flex items-center gap-2 text-[13px]">
        {order.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "next";
          const clickable = state === "done" && canGo(s);
          return (
            <li key={s} className="flex min-w-0 items-center gap-2">
              {i > 0 ? <span aria-hidden className={cn("h-px w-5 shrink-0 sm:w-10", i <= idx ? "bg-sea" : "bg-mist")} /> : null}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onGo(s)}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-full py-1 pe-1 transition-colors",
                  clickable && "hover:text-sea",
                  state === "next" ? "text-faint" : "text-ink",
                )}
              >
                <span
                  className={cn(
                    "tnum grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                    state === "done" && "bg-sea text-white",
                    state === "current" && "bg-ink text-white",
                    state === "next" && "border border-mist text-faint",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className={cn("truncate", state === "current" ? "font-medium" : "max-sm:hidden")}>{t.steps[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ServiceStep({
  business,
  locale,
  t,
  selected,
  onPick,
}: {
  business: PublicBusiness;
  locale: Locale;
  t: Copy;
  selected: string | null;
  onPick: (s: PublicService) => void;
}) {
  return (
    <section className="mt-7" aria-labelledby="service-title">
      <h1 id="service-title" className="font-display text-[26px] leading-tight font-semibold sm:text-[30px]">
        {t.serviceTitle}
      </h1>
      <ul className="mt-6 divide-y divide-mist overflow-hidden rounded-panel border border-mist bg-card">
        {business.services.map((s) => {
          const people = business.staff.filter((p) => p.serviceIds.includes(s.id));
          const isSel = s.id === selected;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                aria-pressed={isSel}
                className={cn(
                  "group grid w-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-5 py-4 text-start transition-colors sm:px-6 sm:py-5",
                  isSel ? "bg-sea-soft" : "hover:bg-mist-2/60",
                )}
              >
                <span className="font-display text-[17px] leading-snug font-semibold text-ink">
                  {pick(locale, s.name, s.nameAr)}
                </span>
                <span className="text-[15px] font-medium text-ink">{formatMoney(s.priceMinor, business.currency, locale)}</span>
                <span className="text-[14px] leading-relaxed text-muted">{pick(locale, s.description ?? "", s.descriptionAr)}</span>
                <span className="tnum text-end text-[13px] whitespace-nowrap text-muted">{formatDuration(s.durationMin, locale)}</span>
                <span className="col-span-2 mt-2 flex items-center gap-2">
                  <span className="flex gap-1">
                    {people.slice(0, 3).map((p) => (
                      <Avatar key={p.id} name={p.name} color={p.color} size={22} />
                    ))}
                  </span>
                  <span className="truncate text-[13px] text-faint">
                    {people.map((p) => pick(locale, p.name, p.nameAr)).join(locale === "ar" ? "، " : ", ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StaffChip({
  active,
  onClick,
  label,
  hint,
  staff,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  staff?: PublicStaff;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-14 shrink-0 items-center gap-2.5 rounded-[14px] border px-3 pe-4 text-start transition-colors",
        active ? "border-ink bg-ink text-white" : "border-mist bg-card text-ink hover:border-ink-2/40",
      )}
    >
      {staff ? (
        <Avatar name={staff.name} color={staff.color} size={32} />
      ) : (
        <span className={cn("grid size-8 place-items-center rounded-full", active ? "bg-white/15" : "bg-sea-soft text-sea-deep")}>
          <Settings2 className="size-4" aria-hidden />
        </span>
      )}
      <span className="grid">
        <span className="text-[14px] leading-tight font-medium whitespace-nowrap">{label}</span>
        {hint ? <span className={cn("text-[12px] whitespace-nowrap", active ? "text-white/60" : "text-muted")}>{hint}</span> : null}
      </span>
    </button>
  );
}

function DetailsStep({
  business,
  t,
  hold,
  ticket,
  onBack,
  onConflict,
  onDone,
}: {
  business: PublicBusiness;
  t: Copy;
  hold: Hold;
  ticket: TicketProps;
  onBack: () => void;
  onConflict: (code: ApiError) => void;
  onDone: (r: Omit<Result, "bookingId">) => void;
}) {
  const country = currencyCountry[business.currency] ?? "AE";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // The field shows the country code, so a bare local number is the norm.
  const toPhone = (raw: string) => {
    const v = raw.trim();
    if (!v) return null;
    const international = v.startsWith("+") || v.startsWith("00");
    return normalizePhone(international ? v : `0${v.replace(/^0+/, "")}`, country);
  };
  const check = (field: string, value: string): string | undefined => {
    const v = value.trim();
    if (field === "name") return v.length < 2 ? t.errors.name : undefined;
    if (field === "phone") return toPhone(v) ? undefined : t.errors.phone;
    if (field === "email") return v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? t.errors.email : undefined;
  };
  // Validate when someone leaves a field, and clear the message as soon as it's fixed.
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    if (!value.trim() && name !== "email") return;
    setErrors((prev) => ({ ...prev, [name]: check(name, value) ?? "" }));
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    if (errors[name] && !check(name, value)) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const phoneRaw = String(fd.get("phone") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const next: Record<string, string> = {};
    for (const [k, v] of [["name", name], ["phone", phoneRaw], ["email", email]] as const) {
      const msg = check(k, v);
      if (msg) next[k] = msg;
    }
    const phone = toPhone(phoneRaw);
    setErrors(next);
    if (Object.keys(next).length) {
      e.currentTarget.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    setPending(true);
    setFailure(null);
    const r = await api<Omit<Result, "bookingId">>(`/api/b/${business.slug}/confirm`, {
      method: "POST",
      body: JSON.stringify({ bookingId: hold.bookingId, token: hold.token, name, phone, email, notes }),
    });
    setPending(false);
    if (r.ok) return onDone(r.data);
    if (r.error === "slot_taken" || r.error === "hold_expired" || r.error === "not_available") return onConflict(r.error);
    if (r.error === "invalid" && r.fields?.length) {
      setErrors(Object.fromEntries(r.fields.map((f) => [f, (t.errors as Record<string, string>)[f] ?? t.errors.generic])));
      return;
    }
    setFailure(t.errors.generic);
  }

  return (
    <section className="mt-7" aria-labelledby="details-title">
      <div className="lg:hidden">
        <LiveTicket {...ticket} holdUntil={hold.expiresAt} />
      </div>
      <h1 id="details-title" className="font-display mt-8 text-[26px] leading-tight font-semibold sm:text-[30px] lg:mt-0">
        {t.detailsTitle}
      </h1>
      <form onSubmit={submit} noValidate className="mt-6 grid max-w-xl gap-5">
        <Field label={t.name} htmlFor="f-name" error={errors.name}>
          <Input id="f-name" name="name" autoComplete="name" placeholder={t.namePh} aria-invalid={!!errors.name} onBlur={onBlur} onChange={onChange} required />
        </Field>
        <Field label={t.phone} htmlFor="f-phone" hint={t.phoneHint} error={errors.phone}>
          <div className="relative" dir="ltr">
            <span className="tnum pointer-events-none absolute inset-y-0 start-0 grid place-items-center ps-3 text-[15px] text-muted">
              +{dialCode[country]}
            </span>
            <Input
              id="f-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="50 123 4567"
              aria-invalid={!!errors.phone}
              onBlur={onBlur}
              onChange={onChange}
              className="tnum ps-[4.25rem]"
              required
            />
          </div>
        </Field>
        <Field
          label={`${t.email} (${t.optional})`}
          htmlFor="f-email"
          error={errors.email}
        >
          <Input id="f-email" name="email" type="email" autoComplete="email" dir="ltr" aria-invalid={!!errors.email} onBlur={onBlur} onChange={onChange} className="rtl:text-right" />
        </Field>
        <Field label={`${t.notes} (${t.optional})`} htmlFor="f-notes">
          <Textarea id="f-notes" name="notes" placeholder={t.notesPh} maxLength={500} />
        </Field>

        {failure ? (
          <p role="alert" className="rounded-control bg-rose-soft px-4 py-3 text-[14px] text-rose">
            {failure}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" size="lg" disabled={pending} className="min-w-44">
            {pending ? <Spinner /> : null}
            {pending ? t.confirming : t.confirm}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={pending}>
            {t.back}
          </Button>
        </div>
        <p className="text-[13px] text-muted lg:hidden">{t.policy(business.cancelWindowHours)}</p>
      </form>
    </section>
  );
}

function DoneView({
  business,
  service,
  staff,
  result,
  locale,
  t,
  onAnother,
}: {
  business: PublicBusiness;
  service: PublicService;
  staff: PublicStaff | null;
  result: Result;
  locale: Locale;
  t: Copy;
  onAnother: () => void;
}) {
  const start = new Date(result.startsAt);
  const end = addMinutes(start, service.durationMin);
  const bizName = pick(locale, business.name, business.nameAr);
  const title = `${pick(locale, service.name, service.nameAr)} | ${bizName}`;
  const location = pick(locale, business.address ?? "", business.addressAr) || null;
  const manageHref = `/m/${result.manageToken}`;
  const code = result.bookingId.replace(/^bk_?/, "").slice(-6).toUpperCase();

  function ics() {
    const manageUrl = `${window.location.origin}${manageHref}`;
    downloadIcs(
      `${business.slug}-${result.startsAt.slice(0, 10)}.ics`,
      buildIcs({ uid: result.bookingId, start, end, title, location, url: manageUrl, description: manageUrl }),
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pt-8 pb-16 sm:pt-12">
      <div className="animate-rise">
        <h1 className="font-display text-[30px] leading-tight font-semibold">{t.done.title}</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          {t.done.sentTo}{" "}
          <bdi dir="ltr" className="tnum font-medium whitespace-nowrap text-ink">
            {formatPhone(result.phone)}
          </bdi>
        </p>
      </div>
      <Ticket
        className="mt-7 animate-rise [animation-delay:120ms]"
        business={business}
        service={service}
        staff={staff}
        start={result.startsAt}
        locale={locale}
        status="confirmed"
        code={code}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={ics} className={buttonClass("saffron", "md", "w-full")}>
              <CalendarPlus className="size-4" aria-hidden />
              {t.done.addCalendar}
            </button>
            <a
              href={googleCalendarUrl({ start, end, title, location, details: `${typeof window !== "undefined" ? window.location.origin : ""}${manageHref}` })}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("ghost", "md", "w-full text-white hover:bg-white/10 hover:text-white")}
            >
              {t.done.google}
            </a>
          </div>
        }
      />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`${manageHref}?lang=${locale}`} className={buttonClass("outline", "md")}>
          {t.done.manage}
        </Link>
        <Button variant="ghost" onClick={onAnother}>
          {t.done.another}
        </Button>
      </div>
      <p className="mt-6 text-[13px] text-muted">{t.policy(business.cancelWindowHours)}</p>
    </main>
  );
}
