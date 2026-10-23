import { cn } from "@/components/ui";

/** Mawid mark: a day (the arc) with the saffron now-dot crossing it. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-sea-deep)" />
      <path d="M7 21a9 9 0 0 1 18 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 24.5h18" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      <circle cx="21.4" cy="13.6" r="3.1" fill="var(--color-saffron)" />
    </svg>
  );
}

export function Logo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("font-display text-[19px] font-semibold tracking-tight", tone === "white" ? "text-white" : "text-ink")}>
        Mawid
      </span>
    </span>
  );
}
