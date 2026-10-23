"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Avatar, cn } from "@/components/ui";
import { enDate, formatMoney } from "@/lib/format";
import type { Insights } from "@/server/dashboard";
import { PageHeader } from "./common";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Sequential ramp: one hue (sea), light to dark.
const RAMP = ["#eef5f3", "#d4e8e4", "#b2d4ce", "#86bab2", "#579c93", "#2f7d75", "#1d6b66", "#134e4a"];

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => enDate(d, opts);

export function InsightsView({ data, currency, weekStart }: { data: Insights; currency: string; weekStart: number }) {
  const money = (minor: number) => formatMoney(minor, currency, "en");
  // Only compare when the previous period has real history behind it, so a new
  // business (or a fresh demo) doesn't show "+2,900%".
  const comparable = data.previous.booked >= data.totals.booked * 0.4;
  const delta = (now: number, before: number) => (comparable && before ? (now - before) / before : null);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Insights" description="How the diary is filling, when people come, and what they book." />

      <div role="tablist" aria-label="Date range" className="mt-6 inline-flex rounded-control border border-mist bg-card p-0.5">
        {[7, 28, 90].map((d) => (
          <Link
            key={d}
            href={`/dashboard/insights?days=${d}`}
            role="tab"
            aria-selected={data.days === d}
            scroll={false}
            className={cn("h-8 rounded-[8px] px-3 text-[13px] leading-8 transition-colors", data.days === d ? "bg-ink text-white" : "text-ink-2 hover:bg-mist-2")}
          >
            Last {d} days
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 divide-mist overflow-hidden rounded-panel border border-mist bg-card max-lg:divide-y lg:grid-cols-4 lg:divide-x">
        <Tile label="Appointments" value={data.totals.booked.toLocaleString("en")} change={delta(data.totals.booked, data.previous.booked)} upIsGood note="Not enough history to compare yet" />
        <Tile label="Takings" value={money(data.totals.revenue)} change={delta(data.totals.revenue, data.previous.revenue)} upIsGood />
        <Tile
          label="No-show rate"
          value={pct(data.noShowRate)}
          change={comparable && data.previous.booked ? data.noShowRate - data.prevNoShowRate : null}
          note="of booked visits"
          absolute
          upIsGood={false}
        />
        <Tile label="Booked online" value={pct(data.onlineShare)} note="of appointments, no phone call" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Appointments per day" subtitle={`${dayLabel(data.first, { day: "numeric", month: "short" })} to ${dayLabel(data.today, { day: "numeric", month: "short" })}`}>
          <DailyColumns series={data.series} money={money} />
        </Card>
        <Card title="How people booked" subtitle="Share of appointments by where they came from">
          <Sources sources={data.sources} />
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-mist pt-5 text-[13.5px]">
            <div>
              <dt className="text-muted">Typical notice</dt>
              <dd className="font-display tnum mt-1 text-[20px] font-semibold">
                {data.medianLeadHours >= 48 ? `${Math.round(data.medianLeadHours / 24)} days` : `${Math.round(data.medianLeadHours)} h`}
              </dd>
              <dd className="text-[12.5px] text-muted">between booking and visit</dd>
            </div>
            <div>
              <dt className="text-muted">Returning customers</dt>
              <dd className="font-display tnum mt-1 text-[20px] font-semibold">{pct(data.returningShare)}</dd>
              <dd className="text-[12.5px] text-muted">had been before</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Busiest hours" subtitle="Appointments by day and starting hour">
          <Heatmap heat={data.heat} weekStart={weekStart} />
        </Card>
        <Card title="Team workload" subtitle="Share of working hours that were booked">
          <ul className="grid gap-4">
            {data.staff.map((s) => (
              <li key={s.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                <Avatar name={s.name} color={s.color} size={28} className="row-span-2" />
                <span className="truncate text-[14px]">{s.name}</span>
                <span className="tnum text-end text-[14px] font-medium">{pct(s.utilisation)}</span>
                <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-sea-soft" role="meter" aria-valuenow={Math.round(s.utilisation * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} booked`}>
                  <span className="block h-full rounded-full bg-sea" style={{ width: pct(Math.min(1, s.utilisation)) }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Top services" subtitle="By number of appointments">
          <TopServices rows={data.topServices} money={money} />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-panel border border-mist bg-card p-5 sm:p-6">
      <h2 className="text-[15px] font-medium">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Tile({
  label,
  value,
  change,
  upIsGood,
  absolute,
  note,
}: {
  label: string;
  value: string;
  change?: number | null;
  upIsGood?: boolean;
  absolute?: boolean;
  note?: string;
}) {
  const show = change !== undefined && change !== null && Number.isFinite(change);
  const good = show && (change! > 0) === !!upIsGood;
  const flat = show && Math.abs(change!) < 0.005;
  const text = show ? `${change! > 0 ? "+" : change! < 0 ? "−" : ""}${absolute ? `${Math.abs(Math.round(change! * 1000) / 10)} pts` : pct(Math.abs(change!))}` : null;
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-[26px] leading-none font-semibold">{value}</p>
      <p className="mt-2 text-[12.5px]">
        {text ? (
          <>
            <span className={cn("tnum font-medium", flat ? "text-muted" : good ? "text-sea" : "text-rose")}>{flat ? "No change" : text}</span>
            <span className="text-muted"> vs previous period</span>
          </>
        ) : (
          <span className="text-muted">{note ?? " "}</span>
        )}
      </p>
    </div>
  );
}

/* --------------------------- daily columns ------------------------- */

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const m = [1, 2, 2.5, 5, 10].find((k) => k * step >= v) ?? 10;
  return m * step;
}

function DailyColumns({ series, money }: { series: Insights["series"]; money: (m: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...series.map((s) => s.booked), 1));
  const ticks = [0, max / 2, max];
  const peak = series.reduce((best, s, i) => (s.booked > series[best].booked ? i : best), 0);
  const H = 180;
  const every = series.length > 31 ? 14 : 7;
  const h = hover !== null ? series[hover] : null;

  return (
    <div>
      <div className="relative ps-8">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 flex items-center" style={{ bottom: (t / max) * H }}>
            <span className="tnum w-7 pe-1.5 text-end text-[11px] text-faint">{compact(t)}</span>
            <span className="h-px flex-1 bg-mist-2" />
          </div>
        ))}
        <div className="relative flex items-end gap-[2px]" style={{ height: H }} onPointerLeave={() => setHover(null)}>
          {series.map((s, i) => (
            <button
              key={s.date}
              type="button"
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${dayLabel(s.date, { weekday: "long", day: "numeric", month: "long" })}: ${s.booked} appointments`}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className={cn("block w-full max-w-6 rounded-t-[4px] transition-colors", hover === i ? "bg-sea-deep" : "bg-sea")}
                style={{ height: Math.max(s.booked ? 3 : 0, (s.booked / max) * H) }}
              />
              {i === peak && s.booked ? (
                <span className="tnum pointer-events-none absolute text-[11px] font-medium text-ink-2" style={{ bottom: (s.booked / max) * H + 4 }}>
                  {s.booked}
                </span>
              ) : null}
            </button>
          ))}
          {h ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute -top-2 z-10 w-44 -translate-x-1/2 -translate-y-full rounded-[10px] bg-ink px-3 py-2 text-[12px] text-white shadow-pop"
              style={{ left: `${((hover! + 0.5) / series.length) * 100}%` }}
            >
              <p className="text-white/60">{dayLabel(h.date, { weekday: "short", day: "numeric", month: "short" })}</p>
              <p className="tnum mt-0.5 text-[15px] font-semibold">{h.booked} appointments</p>
              <p className="tnum text-white/75">{money(h.revenue)} takings</p>
              {h.noShow ? <p className="tnum text-white/75">{h.noShow} no-show</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex ps-8">
        {series.map((s, i) => (
          <span key={s.date} className="tnum flex-1 overflow-visible text-[11px] whitespace-nowrap text-faint">
            {i % every === 0 ? dayLabel(s.date, { day: "numeric", month: "short" }) : ""}
          </span>
        ))}
      </div>
      <details className="mt-4 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as a table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-[10px] border border-mist">
          <table className="w-full">
            <thead className="sticky top-0 bg-card text-muted">
              <tr>
                <th className="px-3 py-2 text-start font-normal">Day</th>
                <th className="px-3 py-2 text-end font-normal">Appointments</th>
                <th className="px-3 py-2 text-end font-normal">No-shows</th>
                <th className="px-3 py-2 text-end font-normal">Takings</th>
              </tr>
            </thead>
            <tbody className="tnum divide-y divide-mist">
              {[...series].reverse().map((s) => (
                <tr key={s.date}>
                  <td className="px-3 py-1.5">{dayLabel(s.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="px-3 py-1.5 text-end">{s.booked}</td>
                  <td className="px-3 py-1.5 text-end">{s.noShow}</td>
                  <td className="px-3 py-1.5 text-end">{money(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------ sources ---------------------------- */

const SOURCE_META: Record<string, { label: string; color: string }> = {
  web: { label: "Online booking page", color: "#1D6B66" },
  dashboard: { label: "Added by staff", color: "#A9B8B5" },
  assistant: { label: "Assistant", color: "#687D79" },
};

function Sources({ sources }: { sources: Insights["sources"] }) {
  const order = ["web", "dashboard", "assistant"];
  const rows = order.map((k) => ({ key: k, n: sources.find((s) => s.source === k)?.n ?? 0, ...SOURCE_META[k] })).filter((r) => r.n);
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={rows.map((r) => `${r.label} ${pct(r.n / total)}`).join(", ")}>
        {rows.map((r) => (
          <span key={r.key} title={`${r.label}: ${r.n}`} style={{ width: pct(r.n / total), background: r.color }} />
        ))}
      </div>
      <ul className="mt-4 grid gap-2 text-[13.5px]">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />
            <span className="flex-1">{r.label}</span>
            <span className="tnum text-muted">{r.n}</span>
            <span className="tnum w-11 text-end font-medium">{pct(r.n / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ heatmap ---------------------------- */

function Heatmap({ heat, weekStart }: { heat: Insights["heat"]; weekStart: number }) {
  const [hover, setHover] = useState<{ wd: number; hr: number; n: number } | null>(null);
  const hours = heat.length ? [...new Set(heat.map((h) => h.hour))].sort((a, b) => a - b) : [];
  const from = hours.length ? Math.min(...hours) : 9;
  const to = hours.length ? Math.max(...hours) : 18;
  const cols = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const days = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  const max = Math.max(1, ...heat.map((h) => h.n));
  const at = (wd: number, hr: number) => heat.find((h) => h.weekday === wd && h.hour === hr)?.n ?? 0;
  const step = (n: number) => (n === 0 ? -1 : Math.min(RAMP.length - 1, Math.floor((n / max) * (RAMP.length - 1) + 0.0001)));

  return (
    <div className="relative" onPointerLeave={() => setHover(null)}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[480px] gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${cols.length}, minmax(0,1fr))` }}>
          <span />
          {cols.map((h) => (
            <span key={h} className="tnum pb-1 text-center text-[11px] text-faint">
              {h % 2 === 0 ? `${h}` : ""}
            </span>
          ))}
          {days.map((wd) => (
            <Row key={wd}>
              <span className="self-center text-[12px] text-muted">{DAY[wd]}</span>
              {cols.map((hr) => {
                const n = at(wd, hr);
                const s = step(n);
                return (
                  <button
                    key={hr}
                    type="button"
                    aria-label={`${DAY[wd]} ${hr}:00, ${n} appointments`}
                    onPointerEnter={() => setHover({ wd, hr, n })}
                    onFocus={() => setHover({ wd, hr, n })}
                    className={cn("h-7 rounded-[4px] transition-[outline] outline-offset-1", hover?.wd === wd && hover.hr === hr && "outline-2 outline-ink")}
                    style={{ background: s < 0 ? "var(--color-paper)" : RAMP[s] }}
                  />
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted">
        <span className="flex items-center gap-2">
          Fewer
          <span className="flex gap-[2px]">
            {RAMP.map((c) => (
              <span key={c} className="h-2.5 w-4 rounded-[2px]" style={{ background: c }} />
            ))}
          </span>
          More
        </span>
        <span className="tnum min-h-4 text-ink-2">
          {hover ? `${DAY[hover.wd]} ${String(hover.hr).padStart(2, "0")}:00 to ${String(hover.hr + 1).padStart(2, "0")}:00, ${hover.n} appointment${hover.n === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/* --------------------------- top services -------------------------- */

function TopServices({ rows, money }: { rows: Insights["topServices"]; money: (m: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_110px] items-center gap-4 text-[14px] max-sm:grid-cols-[minmax(0,1fr)_auto]">
          <span className="truncate">{r.name}</span>
          <span className="flex items-center gap-2 max-sm:col-span-2 max-sm:row-start-2">
            <span className="h-3 rounded-e-[4px] bg-sea" style={{ width: `${(r.n / max) * 100}%` }} />
            <span className="tnum text-[13px] font-medium">{r.n}</span>
          </span>
          <span className="tnum text-end text-muted">{money(r.revenue)}</span>
        </li>
      ))}
    </ul>
  );
}
