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

/**
 * Loads availability for one service, refetching when inputs change.
 * Status is derived from which request the stored result belongs to, so no
 * state is set synchronously inside the effect.
 */
export function useAvailability(url: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = url ? `${url}#${nonce}` : null;
  const [result, setResult] = useState<{ key: string; url: string; days: SerializedDay[]; ok: boolean } | null>(null);

  useEffect(() => {
    if (!url || !key) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { days: SerializedDay[] }) => setResult({ key, url, days: b.days, ok: true }))
      .catch((e) => {
        if (e?.name !== "AbortError") setResult((prev) => ({ key, url, days: prev?.url === url ? prev.days : [], ok: false }));
      });
    return () => ctrl.abort();
  }, [url, key]);

  const status: "idle" | "loading" | "ready" | "error" = !key ? "idle" : result?.key === key ? (result.ok ? "ready" : "error") : "loading";
  // While a request is in flight, keep the old days only if they are for the same query.
  const days = !result ? [] : !key || result.key === key || result.url === url ? result.days : [];
  return { status, days, url, reload: () => setNonce((n) => n + 1) };
}

/** A clock that ticks while `active`. Starts at 0 so render never reads the clock. */
export function useNow(active: boolean, every = 1000) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, every);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, every]);
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
