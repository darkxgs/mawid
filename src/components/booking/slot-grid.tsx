"use client";

import { Sun, Sunrise, Sunset } from "lucide-react";
import { cn } from "@/components/ui";
import { formatTime, type Locale } from "@/lib/format";
import { copy } from "@/lib/copy";
import { partOfDay, type DayPart, type SerializedDay, type SlotPick } from "./shared";

const ICONS: Record<DayPart, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Sunset };

export function SlotGrid({
  day,
  selected,
  onSelect,
  locale,
  tz,
}: {
  day: SerializedDay;
  selected: string | null;
  onSelect: (slot: SlotPick) => void;
  locale: Locale;
  tz: string;
}) {
  const t = copy(locale);
  const groups = new Map<DayPart, SerializedDay["slots"]>();
  for (const s of day.slots) {
    const p = partOfDay(s.start, tz);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p)!.push(s);
  }

  return (
    <div className="grid gap-5" role="radiogroup" aria-label={t.timeTitle}>
      {(["morning", "afternoon", "evening"] as const).map((part) => {
        const slots = groups.get(part);
        if (!slots?.length) return null;
        const Icon = ICONS[part];
        return (
          <div key={part}>
            <p className="mb-2 flex items-center gap-1.5 text-[13px] text-muted">
              <Icon className="size-3.5" aria-hidden />
              {t.parts[part]}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {slots.map((s) => {
                const isSel = s.start === selected;
                return (
                  <button
                    key={s.start}
                    type="button"
                    role="radio"
                    aria-checked={isSel}
                    onClick={() => onSelect(s)}
                    className={cn(
                      "tnum h-11 rounded-control border text-[15px] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.96] active:duration-75",
                      isSel
                        ? "border-saffron bg-saffron text-ink shadow-[0_6px_16px_-8px_rgb(184_116_18/0.7)]"
                        : "border-mist bg-card text-ink hover:border-sea hover:text-sea-deep",
                    )}
                  >
                    {formatTime(new Date(s.start), tz, locale)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
