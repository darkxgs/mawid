"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Badge, cn, type StatusTone } from "@/components/ui";

export const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  confirmed: { label: "Confirmed", tone: "confirmed" },
  completed: { label: "Attended", tone: "completed" },
  no_show: { label: "No-show", tone: "no_show" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
  held: { label: "Holding", tone: "held" },
};

export const SOURCE: Record<string, string> = {
  web: "Online",
  dashboard: "By staff",
  assistant: "Assistant",
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight font-medium sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Native <dialog>: focus is trapped, Escape closes, the page behind is inert.
 * `variant="sheet"` slides in from the inline-end edge.
 */
export function Overlay({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "modal",
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "sheet";
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ ["--w" as string]: `${width}px` }}
      data-variant={variant}
      className={cn(
        "overlay m-0 max-h-none max-w-none bg-transparent p-0 text-ink open:flex",
        variant === "modal" && "inset-0 h-dvh w-full items-end justify-center sm:items-center",
        variant === "sheet" && "inset-0 h-dvh w-full justify-end",
      )}
    >
      <div
        className={cn(
          "overlay-panel flex flex-col bg-card shadow-pop",
          variant === "modal" && "max-h-[92dvh] w-full rounded-t-[20px] sm:w-[var(--w)] sm:max-w-[calc(100vw-2rem)] sm:rounded-[20px]",
          variant === "sheet" && "h-full w-full sm:w-[var(--w)]",
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-mist px-5 py-4 sm:px-6">
          <div className="font-display min-w-0 text-[18px] font-medium">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-mist-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? <div className="border-t border-mist px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </dialog>
  );
}

export function Stat({ label, value, hint, children }: { label: string; value: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="font-display tnum mt-1 text-[24px] leading-none font-medium">{value}</p>
      {hint ? <p className="mt-1.5 truncate text-[12.5px] text-muted">{hint}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-mist px-6 py-12 text-center">
      <p className="font-display text-[17px] font-medium">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
