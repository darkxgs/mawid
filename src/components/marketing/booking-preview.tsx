"use client";

import Link from "next/link";
import { useState } from "react";
import { DayStrip } from "@/components/booking/day-strip";
import { SlotGrid } from "@/components/booking/slot-grid";
import type { SerializedDay, SlotPick } from "@/components/booking/shared";
import { buttonClass, cn } from "@/components/ui";
import { addDays, weekdayOf } from "@/lib/time";

const TZ = "Asia/Dubai";
const FIRST = "2026-11-02";

// A fixed, believable week: Sunday closed, Friday short, afternoons busier.
const PATTERN: Record<number, number[]> = {
  1: [9 * 60 + 30, 10 * 60 + 15, 11 * 60, 14 * 60 + 30, 16 * 60, 17 * 60 + 45],
  2: [9 * 60, 9 * 60 + 45, 12 * 60 + 15, 15 * 60 + 30, 18 * 60],
  3: [10 * 60 + 30, 11 * 60 + 15, 16 * 60 + 45],
  4: [9 * 60 + 15, 13 * 60, 14 * 60 + 15, 15 * 60, 17 * 60, 18 * 60 + 30, 19 * 60 + 15],
  5: [9 * 60, 10 * 60],
  6: [10 * 60, 11 * 60 + 30, 12 * 60 + 45],
};

// Dubai has no daylight saving (UTC+4 all year), so sample times are plain arithmetic
// and nothing reads the clock while the page prerenders.
const utcIso = (date: string, localMin: number) => {
  const m = localMin - 4 * 60;
  return `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00.000Z`;
};

const DAYS: SerializedDay[] = Array.from({ length: 10 }, (_, i) => {
  const date = addDays(FIRST, i);
  const mins = PATTERN[weekdayOf(date)] ?? [];
  return {
    date,
    closed: !mins.length,
    capacityMin: mins.length ? 600 : 0,
    bookedMin: mins.length ? 600 - mins.length * 45 : 0,
    slots: mins.map((m) => ({ start: utcIso(date, m), staffIds: ["a"] })),
  };
});

/** The real day strip and slot grid, running on sample data inside a phone. */
export function BookingPreview({ className }: { className?: string }) {
  const [date, setDate] = useState(FIRST);
  const [slot, setSlot] = useState<SlotPick | null>(null);
  const day = DAYS.find((d) => d.date === date)!;

  return (
    <div className={cn("w-full max-w-[360px] rounded-[34px] bg-ink p-2.5 shadow-[0_40px_80px_-30px_rgb(15_46_53/0.55)]", className)}>
      <div dir="rtl" lang="ar" className="overflow-hidden rounded-[26px] bg-paper">
        <div className="flex items-center gap-3 border-b border-mist bg-card px-4 pt-5 pb-3.5">
          <span className="grid size-9 place-items-center rounded-[9px] bg-sea-deep text-[16px] font-bold text-white">N</span>
          <div className="min-w-0">
            <p className="font-kufi truncate text-[14px] font-semibold">عيادة نور لطب الأسنان</p>
            <p className="truncate text-[12px] text-muted">جميرا، دبي</p>
          </div>
        </div>
        <div className="px-4 pt-4 pb-3">
          <p className="font-kufi text-[17px] font-bold">اختر الوقت</p>
          <p className="mt-0.5 text-[12.5px] text-muted">فحص وتنظيف، 45 دقيقة</p>
          <div className="mt-3 [&_p]:text-[13px]">
            <DayStrip days={DAYS} selected={date} loading={false} locale="ar" onSelect={(d) => { setDate(d); setSlot(null); }} />
          </div>
          <div className="mt-4 h-[188px] overflow-y-auto">
            {day.slots.length ? (
              <SlotGrid day={day} selected={slot?.start ?? null} onSelect={setSlot} locale="ar" tz={TZ} />
            ) : (
              <p className="text-[13px] text-muted">العيادة مغلقة في هذا اليوم.</p>
            )}
          </div>
        </div>
        <div className="border-t border-mist bg-card px-4 py-3">
          <Link
            href="/b/noor-dental"
            aria-disabled={!slot}
            className={buttonClass("primary", "lg", cn("w-full", !slot && "pointer-events-none opacity-45"))}
          >
            متابعة
          </Link>
        </div>
      </div>
    </div>
  );
}
