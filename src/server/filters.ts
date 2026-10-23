import type { BookingFilters } from "./dashboard";

const STATUSES = ["confirmed", "completed", "cancelled", "no_show"] as const;

/** Reads list filters from URL search params, ignoring anything unexpected. */
export function parseBookingFilters(sp: Record<string, string | string[] | undefined>): BookingFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const scope = one("scope");
  const status = one("status");
  return {
    scope: scope === "past" || scope === "all" ? scope : "upcoming",
    status: STATUSES.includes(status as never) ? (status as BookingFilters["status"]) : null,
    staffId: one("staff") || null,
    q: one("q")?.slice(0, 80) || null,
    page: Math.max(1, Math.min(500, Number(one("page")) || 1)),
  };
}
