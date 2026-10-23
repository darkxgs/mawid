"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DayStrip } from "@/components/booking/day-strip";
import { SlotGrid } from "@/components/booking/slot-grid";
import type { SerializedDay, SlotPick } from "@/components/booking/shared";
import { buttonClass, cn } from "@/components/ui";
import { formatDateShort, formatTime } from "@/lib/format";
import { PHOTOS } from "@/lib/media";
import { addDays, weekdayOf } from "@/lib/time";

const TZ = "Asia/Dubai";
const FIRST = "2026-11-02";
const PER_PAGE = 5;

// A believable fortnight: Sunday closed, Friday short, afternoons busier.
// At most three rows of times per day, so the screen never needs to scroll.
const PATTERN: Record<number, number[]> = {
  1: [9 * 60 + 30, 10 * 60 + 15, 11 * 60, 14 * 60 + 30, 16 * 60, 17 * 60 + 45],
  2: [9 * 60, 9 * 60 + 45, 12 * 60 + 15, 15 * 60 + 30, 18 * 60],
  3: [10 * 60 + 30, 11 * 60 + 15, 16 * 60 + 45],
  4: [9 * 60 + 15, 13 * 60, 14 * 60 + 15, 15 * 60, 17 * 60, 18 * 60 + 30, 19 * 60 + 15],
  5: [9 * 60, 10 * 60],
  6: [10 * 60, 11 * 60 + 30, 12 * 60 + 45],
};

// Dubai has no daylight saving (UTC+4 all year), so sample times are plain
// arithmetic and nothing reads the clock while the page prerenders.
const utcIso = (date: string, localMin: number) => {
  const m = localMin - 4 * 60;
  return `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00.000Z`;
};

const DAYS: SerializedDay[] = Array.from({ length: PER_PAGE * 2 }, (_, i) => {
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
  const [page, setPage] = useState(0);
  const [date, setDate] = useState(FIRST);
  const [slot, setSlot] = useState<SlotPick | null>(null);
  const visible = DAYS.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const day = DAYS.find((d) => d.date === date)!;

  function turn(to: number) {
    setPage(to);
    const first = DAYS.slice(to * PER_PAGE, to * PER_PAGE + PER_PAGE).find((d) => d.slots.length);
    if (first) setDate(first.date);
    setSlot(null);
  }

  return (
    <div className={cn("w-full max-w-[340px]", className)}>
      <div className="rounded-[46px] bg-ink p-[9px] shadow-[0_50px_90px_-40px_rgb(15_46_53/0.75),inset_0_0_0_1.5px_rgb(255_255_255/0.08)]">
        <div dir="rtl" lang="ar" className="relative overflow-hidden rounded-[37px] bg-paper">
          <StatusBar />

          <div className="relative h-[108px] bg-[#d9d4cb]">
            <Image src={PHOTOS.treatmentRoom.src} alt="" fill sizes="340px" className="object-cover" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(11_33_38/0.55),transparent_60%)]" />
          </div>

          <div className="flex items-start gap-3 px-4">
            <span className="font-display relative z-10 -mt-6 grid size-12 shrink-0 place-items-center rounded-[11px] bg-sea-deep text-[20px] font-bold text-white ring-[3px] ring-paper">
              N
            </span>
            <div className="min-w-0 pt-2">
              <p className="font-kufi truncate text-[14.5px] leading-tight font-bold">عيادة نور لطب الأسنان</p>
              <p className="mt-0.5 truncate text-[12px] text-muted">فحص وتنظيف، 45 دقيقة، 250 د.إ.</p>
            </div>
          </div>

          <div className="px-4 pt-5">
            <DayStrip
              fit
              days={visible}
              selected={date}
              loading={false}
              locale="ar"
              onSelect={(d) => {
                setDate(d);
                setSlot(null);
              }}
              onPrev={page > 0 ? () => turn(page - 1) : undefined}
              onNext={page === 0 ? () => turn(1) : undefined}
            />
            <div className="mt-4 h-[262px] overflow-hidden">
              {day.slots.length ? (
                <SlotGrid day={day} selected={slot?.start ?? null} onSelect={setSlot} locale="ar" tz={TZ} />
              ) : (
                <p className="pt-6 text-center text-[13px] text-muted">العيادة مغلقة يوم الأحد.</p>
              )}
            </div>
          </div>

          <div className="border-t border-mist bg-card px-4 pt-3 pb-2">
            <p className="mb-2.5 h-5 text-center text-[13px] text-ink-2">
              {slot ? `${formatDateShort(new Date(slot.start), TZ, "ar")}، ${formatTime(new Date(slot.start), TZ, "ar")}` : "اختر الوقت اللي يناسبك"}
            </p>
            {slot ? (
              <Link href="/b/noor-dental" className={buttonClass("primary", "lg", "w-full animate-rise")}>
                متابعة
              </Link>
            ) : (
              <span aria-disabled className="flex h-12 w-full items-center justify-center rounded-[12px] bg-mist-2 text-[15px] font-medium text-faint">
                متابعة
              </span>
            )}
            <span aria-hidden className="mx-auto mt-3 block h-[5px] w-32 rounded-full bg-ink/85" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div dir="ltr" aria-hidden className="absolute inset-x-0 top-0 z-10 flex h-12 items-center justify-between px-7 text-white">
      <span className="text-[14px] font-semibold tracking-tight">9:41</span>
      <span className="absolute top-3 left-1/2 h-[24px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1.5">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.1A9.6 9.6 0 0 0 7.5.6 9.6 9.6 0 0 0 .7 3.3l1.1 1.1a8 8 0 0 1 5.7-2.2Z" />
          <path d="M7.5 5.3c1.3 0 2.5.5 3.4 1.3L12 5.5a6.4 6.4 0 0 0-9 0l1.1 1.1c.9-.8 2.1-1.3 3.4-1.3Z" />
          <circle cx="7.5" cy="9.3" r="1.5" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke="currentColor" opacity="0.5" />
          <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
          <path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4Z" fill="currentColor" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}
