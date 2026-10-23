"use client";

import { CalendarPlus, Check, ChevronLeft, ChevronRight, Copy, UserX } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { setStatus } from "@/app/dashboard/actions";
import { Avatar, Button, buttonClass, cn } from "@/components/ui";
import { formatMoney, formatTime, enDate } from "@/lib/format";
import { addDays, minutesToHHMM } from "@/lib/time";
import type { DashBooking, DaySchedule, ScheduleBooking } from "@/server/dashboard";
import { BookingSheet } from "./booking-sheet";
import { EmptyState, SOURCE, Stat } from "./common";
import { NewBookingDialog } from "./new-booking";

const PX_PER_MIN = 1.5;

type Props = {
  schedule: DaySchedule;
  checkout: DashBooking[];
  business: { slug: string; currency: string; timezone: string; name: string };
  services: { id: string; name: string; durationMin: number; priceMinor: number }[];
  team: { id: string; name: string; color: string; serviceIds: string[] }[];
  welcome: boolean;
};

export function TodayView({ schedule, checkout, business, services, team, welcome }: Props) {
  const [selected, setSelected] = useState<ScheduleBooking | DashBooking | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const tz = business.timezone;
  const isToday = schedule.date === schedule.today;
  const label = enDate(schedule.date, { weekday: "long", day: "numeric", month: "long" });

  const upcoming = useMemo(
    () => schedule.bookings.filter((b) => b.status === "confirmed" && (!isToday || b.endMin > schedule.nowMin)).slice(0, 5),
    [schedule, isToday],
  );

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[28px]">{label}</h1>
          {isToday ? <span className="rounded-full bg-sea-soft px-2.5 py-0.5 text-[12px] font-medium text-sea-deep">Today</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-control border border-mist bg-card">
            <Link href={`/dashboard?date=${addDays(schedule.date, -1)}`} aria-label="Previous day" className="grid size-9 place-items-center text-ink-2 hover:text-ink">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href="/dashboard" className={cn("h-9 border-x border-mist px-3 text-[13px] leading-9", isToday ? "text-faint" : "text-ink hover:bg-mist-2")}>
              Today
            </Link>
            <Link href={`/dashboard?date=${addDays(schedule.date, 1)}`} aria-label="Next day" className="grid size-9 place-items-center text-ink-2 hover:text-ink">
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <CalendarPlus className="size-4" /> New booking
          </Button>
        </div>
      </div>

      {welcome ? <Welcome slug={business.slug} /> : null}

      <div className="mt-6 grid grid-cols-2 divide-mist overflow-hidden rounded-panel border border-mist bg-card max-md:divide-y md:grid-cols-4 md:divide-x">
        <Stat label="Appointments" value={schedule.stats.booked} hint={schedule.stats.cancelled ? `${schedule.stats.cancelled} cancelled` : "No cancellations"} />
        <Stat label="Expected takings" value={formatMoney(schedule.stats.revenueMinor, business.currency, "en")} hint="Paid at the visit" />
        <Stat label="Time booked" value={`${Math.round(schedule.stats.utilisation * 100)}%`} hint={`${hoursLabel(schedule.stats.freeMin)} still free`}>
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-mist-2">
            <span className="block h-full rounded-full bg-sea" style={{ width: `${Math.min(100, schedule.stats.utilisation * 100)}%` }} />
          </span>
        </Stat>
        <Stat
          label="Booked online"
          value={`${schedule.stats.online}`}
          hint={schedule.stats.booked ? `of ${schedule.stats.booked}, no phone call needed` : "Share your booking link"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Schedule" className="min-w-0 rounded-panel border border-mist bg-card">
          <div className="flex items-center justify-between border-b border-mist px-4 py-3">
            <p className="text-[14px] font-medium">Schedule</p>
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="size-3.5 accent-sea" />
              Show cancelled
            </label>
          </div>
          {schedule.staff.length ? (
            <Timeline schedule={schedule} tz={tz} showCancelled={showCancelled} onPick={setSelected} isToday={isToday} />
          ) : (
            <div className="p-6">
              <EmptyState title="Closed this day">Nobody on the team works on this day. Change hours under Team &amp; hours.</EmptyState>
            </div>
          )}
        </section>

        <aside className="grid content-start gap-6">
          <RailList title={isToday ? "Up next" : "On this day"} empty={isToday ? "Nothing else today." : "No appointments."}>
            {upcoming.map((b) => (
              <RailItem key={b.id} b={b} tz={tz} team={team} onClick={() => setSelected(b)} />
            ))}
          </RailList>
          {checkout.length ? (
            <RailList title="Needs check-out" empty="">
              {checkout.map((b) => (
                <CheckoutItem key={b.id} b={b} tz={tz} onOpen={() => setSelected(b)} />
              ))}
            </RailList>
          ) : null}
        </aside>
      </div>

      <BookingSheet booking={selected} team={team} currency={business.currency} tz={tz} onClose={() => setSelected(null)} />
      <NewBookingDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        services={services}
        team={team}
        currency={business.currency}
        tz={tz}
        defaultDate={schedule.date}
      />
    </div>
  );
}

function hoursLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/* --------------------------- timeline ------------------------------ */

function Timeline({
  schedule,
  tz,
  showCancelled,
  onPick,
  isToday,
}: {
  schedule: DaySchedule;
  tz: string;
  showCancelled: boolean;
  onPick: (b: ScheduleBooking) => void;
  isToday: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Live now-line: starts from the server's clock, then advances with the device's.
  const [drift, setDrift] = useState({ base: schedule.nowMin, minutes: 0 });
  useEffect(() => {
    if (!isToday) return;
    const base = schedule.nowMin;
    const t0 = Date.now();
    const id = setInterval(() => setDrift({ base, minutes: Math.floor((Date.now() - t0) / 60000) }), 30_000);
    return () => clearInterval(id);
  }, [isToday, schedule.nowMin]);
  const nowMin = isToday ? schedule.nowMin + (drift.base === schedule.nowMin ? drift.minutes : 0) : null;

  const { startMin, endMin } = useMemo(() => {
    let s = 24 * 60;
    let e = 0;
    const ranges = [...schedule.staff.flatMap((st) => st.hours), ...schedule.bookings];
    for (const r of ranges) {
      s = Math.min(s, r.startMin);
      e = Math.max(e, r.endMin);
    }
    if (s >= e) {
      s = 9 * 60;
      e = 18 * 60;
    }
    return { startMin: Math.floor(s / 60) * 60, endMin: Math.ceil(e / 60) * 60 };
  }, [schedule]);

  // Open on "now" (or the first appointment) rather than the top of the day.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? schedule.nowMin : (schedule.bookings[0]?.startMin ?? startMin);
    el.scrollTop = Math.max(0, (target - startMin) * PX_PER_MIN - 120);
  }, [isToday, schedule, startMin]);

  const height = (endMin - startMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const cols = schedule.staff.length;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 56 + cols * 168 }}>
        <div className="sticky top-0 z-20 grid border-b border-mist bg-card" style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(0,1fr))` }}>
          <div />
          {schedule.staff.map((s) => {
            const count = schedule.bookings.filter((b) => b.staffId === s.id && b.status !== "cancelled").length;
            return (
              <div key={s.id} className="flex min-w-0 items-center gap-2 border-s border-mist px-3 py-2.5">
                <Avatar name={s.name} color={s.color} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{s.name}</p>
                  <p className="tnum truncate text-[12px] text-muted">
                    {s.hours.length ? s.hours.map((h) => `${minutesToHHMM(h.startMin)}–${minutesToHHMM(h.endMin)}`).join(", ") : "Not working"}
                  </p>
                </div>
                {count ? (
                  <span className="tnum shrink-0 rounded-full bg-mist-2 px-2 py-0.5 text-[12px] text-ink-2" title={`${count} appointments`}>
                    {count}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div ref={scroller} className="relative max-h-[640px] overflow-y-auto">
          <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${cols}, minmax(0,1fr))`, height }}>
            {/* hour gutter */}
            <div className="relative">
              {hours.map((m) => (
                <span key={m} className="tnum absolute end-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: (m - startMin) * PX_PER_MIN }}>
                  {m === startMin ? "" : minutesToHHMM(m)}
                </span>
              ))}
            </div>

            {schedule.staff.map((s) => (
              <div key={s.id} className="relative border-s border-mist">
                {/* closed time */}
                {closedRanges(s.hours, startMin, endMin).map(([a, b]) => (
                  <div
                    key={a}
                    className="absolute inset-x-0 bg-[repeating-linear-gradient(-45deg,transparent_0_6px,rgb(15_46_53/0.035)_6px_12px)]"
                    style={{ top: (a - startMin) * PX_PER_MIN, height: (b - a) * PX_PER_MIN }}
                  />
                ))}
                {s.away.map((o, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-1 rounded-[8px] border border-dashed border-mist bg-mist-2/70 px-2 py-1 text-[12px] text-muted"
                    style={{ top: (Math.max(o.startMin, startMin) - startMin) * PX_PER_MIN, height: (Math.min(o.endMin, endMin) - Math.max(o.startMin, startMin)) * PX_PER_MIN }}
                  >
                    {o.reason || "Time off"}
                  </div>
                ))}
                {/* hour lines */}
                {hours.slice(1, -1).map((m) => (
                  <div key={m} className="absolute inset-x-0 border-t border-mist/70" style={{ top: (m - startMin) * PX_PER_MIN }} />
                ))}
                {schedule.bookings
                  .filter((b) => b.staffId === s.id && (showCancelled || b.status !== "cancelled"))
                  .map((b) => (
                    <Block key={b.id} b={b} color={s.color} top={(b.startMin - startMin) * PX_PER_MIN} height={(b.endMin - b.startMin) * PX_PER_MIN} tz={tz} onPick={onPick} />
                  ))}
              </div>
            ))}

            {nowMin !== null && nowMin >= startMin && nowMin <= endMin ? (
              <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (nowMin - startMin) * PX_PER_MIN }}>
                <div className="relative ms-[56px] h-[2px] bg-saffron">
                  <span className="absolute -start-[5px] -top-[4px] size-[10px] rounded-full bg-saffron ring-2 ring-card" />
                </div>
                <span className="tnum absolute start-1 -top-[9px] rounded bg-saffron px-1 text-[10.5px] font-semibold text-ink">
                  {minutesToHHMM(nowMin)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function closedRanges(hours: { startMin: number; endMin: number }[], from: number, to: number): [number, number][] {
  const sorted = [...hours].sort((a, b) => a.startMin - b.startMin);
  const out: [number, number][] = [];
  let cursor = from;
  for (const h of sorted) {
    if (h.startMin > cursor) out.push([cursor, h.startMin]);
    cursor = Math.max(cursor, h.endMin);
  }
  if (cursor < to) out.push([cursor, to]);
  return out;
}

function Block({
  b,
  color,
  top,
  height,
  tz,
  onPick,
}: {
  b: ScheduleBooking;
  color: string;
  top: number;
  height: number;
  tz: string;
  onPick: (b: ScheduleBooking) => void;
}) {
  const compact = height < 52;
  const muted = b.status === "completed";
  const missed = b.status === "no_show";
  const gone = b.status === "cancelled";
  const holding = b.status === "held";
  return (
    <button
      type="button"
      onClick={() => onPick(b)}
      className={cn(
        "group absolute inset-x-1 z-[1] overflow-hidden rounded-[8px] px-2 text-start transition-[box-shadow,transform] hover:z-[2] hover:shadow-lift focus-visible:z-[2]",
        compact ? "py-0.5" : "py-1.5",
        gone && "opacity-55",
        holding && "animate-pulse-soft border border-dashed border-saffron-deep bg-saffron-soft",
        missed && "border border-dashed border-saffron-deep/60 bg-card",
      )}
      style={{
        top: top + 1,
        height: Math.max(18, height - 2),
        ...(holding || missed
          ? {}
          : {
              background: muted ? "var(--color-mist-2)" : `color-mix(in oklab, ${color} 13%, white)`,
              borderInlineStart: `3px solid ${muted ? "var(--color-faint)" : color}`,
              color: muted ? "var(--color-muted)" : `color-mix(in oklab, ${color} 78%, black)`,
            }),
      }}
    >
      <span className={cn("flex items-center gap-1.5 text-[12px] leading-tight", compact && "truncate")}>
        <span className={cn("tnum font-semibold", gone && "line-through")}>{formatTime(new Date(b.startsAt), tz, "en")}</span>
        <span className={cn("truncate font-medium", compact ? "" : "hidden")}>{b.customer?.name}</span>
        {muted ? <Check className="ms-auto size-3 shrink-0" /> : null}
        {missed ? <UserX className="ms-auto size-3 shrink-0" /> : null}
      </span>
      {!compact ? (
        <>
          <span className="mt-0.5 block truncate text-[13px] leading-tight font-medium">{holding ? "Someone is booking…" : b.customer?.name}</span>
          <span className="block truncate text-[12px] leading-tight opacity-80">{b.service.name}</span>
        </>
      ) : null}
    </button>
  );
}

/* ---------------------------- rail -------------------------------- */

function RailList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="rounded-panel border border-mist bg-card">
      <p className="border-b border-mist px-4 py-3 text-[14px] font-medium">{title}</p>
      {has ? <ul className="divide-y divide-mist">{children}</ul> : <p className="px-4 py-5 text-[14px] text-faint">{empty}</p>}
    </section>
  );
}

function RailItem({ b, tz, team, onClick }: { b: ScheduleBooking; tz: string; team: Props["team"]; onClick: () => void }) {
  const m = team.find((t) => t.id === b.staffId);
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-mist-2/60">
        <span className="tnum w-11 shrink-0 text-[13px] font-semibold">{formatTime(new Date(b.startsAt), tz, "en")}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{b.customer?.name}</span>
          <span className="block truncate text-[12.5px] text-muted">
            {b.service.name}
            {b.source !== "dashboard" ? ` (${SOURCE[b.source]?.toLowerCase()})` : ""}
          </span>
        </span>
        {m ? <Avatar name={m.name} color={m.color} size={22} /> : null}
      </button>
    </li>
  );
}

function CheckoutItem({ b, tz, onOpen }: { b: DashBooking; tz: string; onOpen: () => void }) {
  const [pending, start] = useTransition();
  return (
    <li className={cn("px-4 py-3 transition-opacity", pending && "opacity-50")}>
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <span className="block truncate text-[14px] font-medium">{b.customer?.name}</span>
        <span className="tnum block truncate text-[12.5px] text-muted">
          {formatTime(new Date(b.startsAt), tz, "en")}
          {", "}
          {enDate(b.startsAt, { weekday: "short" }, tz)}
          {", "}
          {b.service.name}
        </span>
      </button>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await setStatus(b.id, "completed")))}
          className={buttonClass("outline", "sm", "h-7 px-2.5 text-[12px]")}
        >
          <Check className="size-3.5" /> Attended
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await setStatus(b.id, "no_show")))}
          className={buttonClass("ghost", "sm", "h-7 px-2.5 text-[12px]")}
        >
          No-show
        </button>
      </div>
    </li>
  );
}

function Welcome({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  // Read the browser's origin without an effect; the server renders a relative link.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = `${origin}/b/${slug}`;
  return (
    <div className="mt-6 rounded-panel border border-sea/20 bg-sea-soft p-5">
      <p className="font-display text-[18px] font-medium text-sea-deep">Your booking page is live</p>
      <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-2">
        We added you as the first team member with standard hours and one starter service. Rename the service, set your real hours, then share this link
        on WhatsApp, Instagram and Google Maps.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="rounded-[8px] bg-card px-3 py-2 text-[13px]">{url}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          <Copy className="size-3.5" /> {copied ? "Copied" : "Copy link"}
        </Button>
        <Link href="/dashboard/services" className={buttonClass("ghost", "sm")}>
          Edit services
        </Link>
        <Link href="/dashboard/team" className={buttonClass("ghost", "sm")}>
          Set hours
        </Link>
      </div>
    </div>
  );
}
