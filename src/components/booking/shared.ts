"use client";

import { useEffect, useState } from "react";
import type { PublicBusiness, SerializedDay } from "@/server/public";
import { localMinutes } from "@/lib/time";

export type { PublicBusiness, SerializedDay };
export type PublicService = PublicBusiness["services"][number];
export type PublicStaff = PublicBusiness["staff"][number];
export type SlotPick = { start: string; staffIds: string[] };

export type ApiError =
  | "slot_taken"
  | "not_available"
  | "hold_expired"
  | "too_late"
  | "invalid"
  | "not_found"
  | "server_error"
  | "network";

export async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: ApiError; fields?: string[] }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (body.error as ApiError) ?? "server_error", fields: body.fields };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Loads availability for one service, refetching when inputs change. */
export function useAvailability(url: string | null) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; days: SerializedDay[]; url: string | null }>({
    status: "idle",
    days: [],
    url: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setState((s) => ({ status: "loading", days: s.url === url ? s.days : [], url }));
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { days: SerializedDay[] }) => setState({ status: "ready", days: b.days, url }))
      .catch((e) => {
        if (e?.name !== "AbortError") setState((s) => ({ ...s, status: "error" }));
      });
    return () => ctrl.abort();
  }, [url, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/** A clock that ticks every second while `active`. */
export function useNow(active: boolean) {
  // Starts at 0 so server render never reads the clock; the effect sets it.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export type DayPart = "morning" | "afternoon" | "evening";

export function partOfDay(iso: string, tz: string): DayPart {
  const m = localMinutes(new Date(iso), tz);
  if (m < 12 * 60) return "morning";
  if (m < 17 * 60) return "afternoon";
  return "evening";
}

/** Format a plain calendar date without timezone drift. */
export function formatCalendarDate(date: string, tag: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(tag, { ...opts, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
