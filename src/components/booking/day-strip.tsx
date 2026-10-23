"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/components/ui";
import { intlTag, type Locale } from "@/lib/format";
import { copy } from "@/lib/copy";
import { formatCalendarDate, type SerializedDay } from "./shared";

/**
 * Two weeks at a glance. Each day carries a small gauge of how booked it is,
 * so people can see at once which days still have room.
 */
export function DayStrip({
  days,
  selected,
  onSelect,
  locale,
  loading,
  onPrev,
  onNext,
}: {
  days: SerializedDay[];
  selected: string | null;
  onSelect: (date: string) => void;
  locale: Locale;
  loading: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const t = copy(locale);
  const tag = intlTag(locale);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected || !rail.current) return;
    rail.current.querySelector<HTMLElement>(`[data-date="${selected}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);

  const placeholders = loading && !days.length;
  const items = placeholders ? Array.from({ length: 14 }, () => null) : days;

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-display text-[15px] font-semibold text-ink">
          {days[0] ? formatCalendarDate(days[0].date, tag, { month: "long", year: "numeric" }) : " "}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            aria-label={t.earlier}
            className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-mist-2 disabled:opacity-30"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label={t.later}
            className="grid size-8 place-items-center rounded-full text-ink-2 transition-colors hover:bg-mist-2 disabled:opacity-30"
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
        </div>
      </div>

      <div
        ref={rail}
        role="listbox"
        aria-label={t.timeTitle}
        className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {items.map((d, i) => {
          if (!d) {
            return <div key={i} className="h-[92px] w-[60px] shrink-0 animate-pulse rounded-[14px] bg-mist-2" />;
          }
          const load = d.capacityMin > 0 ? Math.min(1, d.bookedMin / d.capacityMin) : 1;
          const free = d.slots.length;
          const isSel = d.date === selected;
          const disabled = d.closed || free === 0;
          const caption = d.closed ? t.closed : free === 0 ? t.full : free <= 3 ? t.left(free) : "";
          const monthStart = i === 0 || d.date.endsWith("-01");
          return (
            <button
              key={d.date}
              type="button"
              role="option"
              aria-selected={isSel}
              data-date={d.date}
              disabled={disabled}
              onClick={() => onSelect(d.date)}
              className={cn(
                "group relative flex h-[92px] w-[60px] shrink-0 snap-start flex-col items-center rounded-[14px] border pt-2.5 transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] active:duration-75",
                isSel
                  ? "border-ink bg-ink text-white"
                  : "border-mist bg-card text-ink hover:border-ink-2/40",
                disabled && "border-transparent bg-transparent text-faint hover:border-transparent",
              )}
            >
              <span className={cn("text-[12px]", isSel ? "text-white/70" : "text-muted", disabled && "text-faint")}>
                {formatCalendarDate(d.date, tag, { weekday: "short" })}
              </span>
              <span className="font-display tnum mt-0.5 text-[22px] leading-none font-semibold">
                {formatCalendarDate(d.date, tag, { day: "numeric" })}
              </span>
              {monthStart && !isSel ? (
                <span className="sr-only">{formatCalendarDate(d.date, tag, { month: "long" })}</span>
              ) : null}
              {/* booked-ness gauge */}
              <span
                aria-hidden
                className={cn("mt-auto mb-1.5 h-[3px] w-8 overflow-hidden rounded-full", isSel ? "bg-white/20" : "bg-mist", disabled && "opacity-0")}
              >
                <span
                  className={cn("block h-full rounded-full", isSel ? "bg-saffron" : load > 0.8 ? "bg-saffron-deep" : "bg-sea")}
                  style={{ width: `${Math.max(8, load * 100)}%` }}
                />
              </span>
              <span
                className={cn(
                  "mb-2 h-3.5 text-[11px] leading-none whitespace-nowrap",
                  isSel ? "text-saffron" : free > 0 && free <= 3 ? "text-saffron-deep" : "text-faint",
                )}
              >
                {caption}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
