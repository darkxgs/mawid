"use client";

import { Download, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Avatar, Input, Select, buttonClass, cn } from "@/components/ui";
import { formatMoney, formatTime, enDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import type { BookingFilters, DashBooking } from "@/server/dashboard";
import { BookingSheet, type TeamLite } from "./booking-sheet";
import { EmptyState, PageHeader, SOURCE, StatusBadge } from "./common";

export function BookingsView({
  rows,
  total,
  pageSize,
  filters,
  currency,
  tz,
  team,
}: {
  rows: DashBooking[];
  total: number;
  pageSize: number;
  filters: BookingFilters;
  currency: string;
  tz: string;
  team: TeamLite[];
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const [selected, setSelected] = useState<DashBooking | null>(null);

  const params = (patch: Partial<Record<keyof BookingFilters, string | number | null>>) => {
    const next = new URLSearchParams();
    const merged = { scope: filters.scope, status: filters.status, staff: filters.staffId, q: filters.q, page: 1, ...renameStaff(patch) };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === 1) && !(k === "scope" && v === "upcoming")) next.set(k, String(v));
    return next.toString();
  };
  const go = (patch: Parameters<typeof params>[0]) => start(() => router.replace(`${path}?${params(patch)}`, { scroll: false }));

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const id = setTimeout(() => go({ q: q || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = (filters.page - 1) * pageSize + 1;
  const to = Math.min(total, filters.page * pageSize);
  const member = (id: string) => team.find((t) => t.id === id);
  const dayLabel = (iso: string) =>
    enDate(iso, { weekday: "short", day: "numeric", month: "short" }, tz);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Bookings"
        description="Every appointment, searchable by name or phone."
        actions={
          <a href={`/api/dashboard/bookings.csv?${params({})}`} className={buttonClass("outline", "md")}>
            <Download className="size-4" /> Export CSV
          </a>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Time range" className="flex rounded-control border border-mist bg-card p-0.5">
          {(["upcoming", "past", "all"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={filters.scope === s}
              onClick={() => go({ scope: s })}
              className={cn(
                "h-8 rounded-[8px] px-3 text-[13px] capitalize transition-colors",
                filters.scope === s ? "bg-ink text-white" : "text-ink-2 hover:bg-mist-2",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="w-40">
          <Select aria-label="Status" value={filters.status ?? ""} onChange={(e) => go({ status: e.target.value || null })} className="h-9 text-[13.5px]">
            <option value="">Any status</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Attended</option>
            <option value="no_show">No-show</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div className="w-48">
          <Select aria-label="Team member" value={filters.staffId ?? ""} onChange={(e) => go({ staffId: e.target.value || null })} className="h-9 text-[13.5px]">
            <option value="">Whole team</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative ms-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" aria-label="Search" className="h-9 ps-9 text-[13.5px]" />
        </div>
      </div>

      <div className={cn("mt-4 transition-opacity", pending && "opacity-60")}>
        {rows.length ? (
          <div className="overflow-hidden rounded-panel border border-mist bg-card">
            <table className="w-full text-[14px] max-md:hidden">
              <thead>
                <tr className="border-b border-mist text-start text-[12.5px] text-muted">
                  <th className="px-4 py-2.5 text-start font-normal">When</th>
                  <th className="px-4 py-2.5 text-start font-normal">Customer</th>
                  <th className="px-4 py-2.5 text-start font-normal">Service</th>
                  <th className="px-4 py-2.5 text-start font-normal">With</th>
                  <th className="px-4 py-2.5 text-start font-normal">Status</th>
                  <th className="px-4 py-2.5 text-end font-normal">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {rows.map((b) => {
                  const m = member(b.staffId);
                  return (
                    <tr key={b.id} onClick={() => setSelected(b)} className="cursor-pointer hover:bg-mist-2/50">
                      <td className="tnum px-4 py-3 whitespace-nowrap">
                        <span className="font-medium">{dayLabel(b.startsAt)}</span>
                        <span className="ms-2 text-muted">{formatTime(new Date(b.startsAt), tz, "en")}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" className="text-start font-medium hover:text-sea" onClick={() => setSelected(b)}>
                          {b.customer?.name ?? "Walk-in"}
                        </button>
                        <span className="tnum block text-[12.5px] text-muted">{b.customer ? formatPhone(b.customer.phone) : ""}</span>
                      </td>
                      <td className="px-4 py-3">
                        {b.service.name}
                        <span className="block text-[12.5px] text-muted">{SOURCE[b.source]}</span>
                      </td>
                      <td className="px-4 py-3">
                        {m ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={m.name} color={m.color} size={22} />
                            {m.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="tnum px-4 py-3 text-end whitespace-nowrap">{formatMoney(b.priceMinor, currency, "en")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <ul className="divide-y divide-mist md:hidden">
              {rows.map((b) => (
                <li key={b.id}>
                  <button type="button" onClick={() => setSelected(b)} className="flex w-full items-start gap-3 px-4 py-3 text-start">
                    <span className="tnum w-14 shrink-0 text-[13px]">
                      <span className="block font-semibold">{formatTime(new Date(b.startsAt), tz, "en")}</span>
                      <span className="block text-muted">{dayLabel(b.startsAt).split(" ").slice(1).join(" ")}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.customer?.name}</span>
                      <span className="block truncate text-[13px] text-muted">{b.service.name}</span>
                    </span>
                    <StatusBadge status={b.status} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState title={filters.q ? `No bookings match “${filters.q}”` : "No bookings here"}>
            {filters.scope === "upcoming" ? "Share your booking link and new appointments will appear here." : "Try a different filter."}
          </EmptyState>
        )}
      </div>

      {total > pageSize ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
          <span className="tnum">
            {from}–{to} of {total}
          </span>
          <div className="flex gap-2">
            {filters.page > 1 ? (
              <Link href={`${path}?${params({ page: filters.page - 1 })}`} className={buttonClass("outline", "sm")} scroll={false}>
                Previous
              </Link>
            ) : null}
            {to < total ? (
              <Link href={`${path}?${params({ page: filters.page + 1 })}`} className={buttonClass("outline", "sm")} scroll={false}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="tnum mt-4 text-[13px] text-muted">{total ? `${total} booking${total === 1 ? "" : "s"}` : ""}</p>
      )}

      <BookingSheet booking={selected} team={team} currency={currency} tz={tz} onClose={() => setSelected(null)} />
    </div>
  );
}

function renameStaff(p: Partial<Record<string, string | number | null>>) {
  const { staffId, ...rest } = p;
  return staffId !== undefined ? { ...rest, staff: staffId } : rest;
}
