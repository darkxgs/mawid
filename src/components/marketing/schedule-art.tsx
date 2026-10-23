import { CheckCheck } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * A still of the product doing its job: a clinic afternoon on the schedule,
 * the now-line passing through, and the reminder that went out on WhatsApp.
 * Pure markup so it renders crisp at any size and needs no screenshots.
 */
const COLS = [
  { name: "Dr. Omar", color: "#1D6B66", blocks: [[0, 3, "Check-up & cleaning"], [3.5, 5, "Filling"], [6, 8, "Toothache visit"]] },
  { name: "Dr. Layla", color: "#A86A1C", blocks: [[0.5, 1.5, "Aligner check-in"], [2, 3, "Braces consult"], [4, 6, "Braces consult"], [6.5, 7.5, "Aligner"]] },
  { name: "Sara", color: "#6B4E8C", blocks: [[1, 4, "Whitening"], [5, 7, "Kids check-up"]] },
] as const;
const HOURS = ["2 PM", "3 PM", "4 PM", "5 PM"];
const ROW = 34; // px per half hour
const NOW = 4.6;

export function ScheduleArt({ className }: { className?: string }) {
  return (
    <div className={cn("relative select-none", className)} aria-hidden>
      <div className="rounded-[20px] border border-white/10 bg-white p-4 shadow-pop">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-[15px] font-medium text-ink">Today</span>
          <span className="tnum text-[12px] text-muted">14 booked</span>
        </div>
        <div className="grid grid-cols-[40px_repeat(3,1fr)] gap-x-2">
          <div />
          {COLS.map((c) => (
            <div key={c.name} className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-2">
              <span className="size-2 rounded-full" style={{ background: c.color }} />
              {c.name}
            </div>
          ))}
          <div className="relative" style={{ height: ROW * 8 }}>
            {HOURS.map((h, i) => (
              <span key={h} className="tnum absolute text-[10px] text-faint" style={{ top: i * ROW * 2 - 6 }}>
                {h}
              </span>
            ))}
          </div>
          {COLS.map((c) => (
            <div key={c.name} className="relative rounded-[8px] bg-paper" style={{ height: ROW * 8 }}>
              {c.blocks.map(([a, b, label]) => (
                <div
                  key={`${a}`}
                  className="absolute inset-x-1 overflow-hidden rounded-[6px] px-1.5 py-1 text-[10.5px] leading-tight font-medium"
                  style={{
                    top: a * ROW + 2,
                    height: (b - a) * ROW - 4,
                    background: `color-mix(in oklab, ${c.color} 14%, white)`,
                    color: `color-mix(in oklab, ${c.color} 80%, black)`,
                    borderInlineStart: `3px solid ${c.color}`,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-4" style={{ top: 16 + 26 + 20 + NOW * ROW }}>
          <div className="relative ms-[40px] h-[2px] bg-saffron">
            <span className="absolute -start-1 -top-[3px] size-2 rounded-full bg-saffron" />
          </div>
        </div>
      </div>

      <div dir="rtl" lang="ar" className="absolute -bottom-10 -start-6 w-[250px] rounded-[16px] rounded-ss-[4px] bg-[#e2f7cb] px-3.5 pt-2.5 pb-2 text-[12.5px] leading-relaxed text-[#111b21] shadow-pop sm:-start-10">
        تذكير بموعدك في عيادة نور لطب الأسنان: فحص وتنظيف، الخميس 29 أكتوبر الساعة 4:30 م.
        <span className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-[#667781]" dir="ltr">
          9:02
          <CheckCheck className="size-3.5 text-[#53bdeb]" />
        </span>
      </div>
    </div>
  );
}
