import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger" | "saffron";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-medium transition-[background-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px select-none";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-sea text-white hover:bg-sea-deep shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]",
  dark: "bg-ink text-white hover:bg-ink-2",
  saffron: "bg-saffron text-ink hover:bg-[#f0b153] shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)]",
  outline: "border border-mist bg-card text-ink hover:border-ink-2/40 hover:bg-mist-2",
  ghost: "text-ink-2 hover:bg-mist-2 hover:text-ink",
  danger: "border border-rose/30 bg-card text-rose hover:bg-rose-soft",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 rounded-[8px] px-3 text-[13px]",
  md: "h-10 rounded-control px-4 text-sm",
  lg: "h-12 rounded-[12px] px-5 text-[15px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

const fieldBase =
  "w-full rounded-control border border-mist bg-card px-3 text-[15px] text-ink placeholder:text-faint transition-colors focus:border-sea focus:outline-none focus:ring-4 focus:ring-sea/10 aria-[invalid=true]:border-rose";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldBase, "h-11 appearance-none bg-[length:16px] pe-9", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-rose" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export type StatusTone = "confirmed" | "completed" | "cancelled" | "no_show" | "held" | "neutral";

const toneClass: Record<StatusTone, string> = {
  confirmed: "bg-sea-soft text-sea-deep",
  completed: "bg-mist-2 text-ink-2",
  cancelled: "bg-rose-soft text-rose",
  no_show: "bg-saffron-soft text-saffron-deep",
  held: "bg-saffron-soft text-saffron-deep",
  neutral: "bg-mist-2 text-muted",
};

export function Badge({ tone = "neutral", children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function initials(name: string) {
  const clean = name.replace(/^(Dr\.?|د\.)\s*/i, "");
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-panel border border-mist bg-card", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-mist bg-mist-2 px-1.5 py-0.5 text-[11px] text-muted">{children}</kbd>;
}
