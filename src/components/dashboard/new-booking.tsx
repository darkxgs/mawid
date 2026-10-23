"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createBooking, type ActionResult } from "@/app/dashboard/actions";
import { Button, Field, Input, Select, Spinner, Textarea, cn } from "@/components/ui";
import { formatMoney, formatTime } from "@/lib/format";
import { Overlay } from "./common";

type Svc = { id: string; name: string; durationMin: number; priceMinor: number };
type Member = { id: string; name: string; serviceIds: string[] };
type Day = { date: string; slots: { start: string; staffIds: string[] }[] };

export function NewBookingDialog({
  open,
  onClose,
  services,
  team,
  currency,
  tz,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  services: Svc[];
  team: Member[];
  currency: string;
  tz: string;
  defaultDate: string;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState("");
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(createBooking, null);

  useEffect(() => setDate(defaultDate), [defaultDate]);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const eligible = useMemo(() => team.filter((m) => m.serviceIds.includes(serviceId)), [team, serviceId]);

  useEffect(() => {
    if (!open || !serviceId || !date) return;
    const ctrl = new AbortController();
    setLoading(true);
    setSlot("");
    fetch(`/api/dashboard/availability?${new URLSearchParams({ service: serviceId, date, ...(staffId ? { staff: staffId } : {}) })}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((b: { days?: Day[] }) => setDay(b.days?.[0] ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, serviceId, staffId, date, state]);

  const f = state && !state.ok ? state.fields ?? {} : {};
  const svc = services.find((s) => s.id === serviceId);

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="New booking"
      width={560}
      footer={
        <div className="flex items-center justify-end gap-2">
          {state && !state.ok ? <p className="me-auto text-[13px] text-rose">{state.error}</p> : null}
          <Button variant="ghost" onClick={onClose} type="button">
            Close
          </Button>
          <Button type="submit" form="new-booking" disabled={pending || !slot}>
            {pending ? <Spinner /> : null}
            Book it
          </Button>
        </div>
      }
    >
      <form id="new-booking" action={action} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service" htmlFor="nb-service">
            <Select id="nb-service" name="serviceId" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setStaffId(""); }}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="With" htmlFor="nb-staff">
            <Select id="nb-staff" name="staffId" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Whoever is free</option>
              {eligible.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4">
            <Field label="Day" htmlFor="nb-date">
              <Input id="nb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </Field>
            {svc ? (
              <p className="tnum pb-3 text-[13px] text-muted">
                {svc.durationMin} min, {formatMoney(svc.priceMinor, currency, "en")}
              </p>
            ) : null}
          </div>
          <input type="hidden" name="startsAt" value={slot} />
          <div className="mt-3 min-h-24">
            {loading ? (
              <Spinner className="text-muted" />
            ) : day?.slots.length ? (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {day.slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => setSlot(s.start)}
                    aria-pressed={slot === s.start}
                    className={cn(
                      "tnum h-9 rounded-[8px] border text-[13.5px] transition-colors",
                      slot === s.start ? "border-saffron bg-saffron font-medium text-ink" : "border-mist hover:border-sea",
                    )}
                  >
                    {formatTime(new Date(s.start), tz, "en")}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-muted">No free times that day{staffId ? " for this person" : ""}.</p>
            )}
            {f.startsAt ? <p className="mt-2 text-[13px] text-rose">{f.startsAt}</p> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="nb-name" error={f.name}>
            <Input id="nb-name" name="name" autoComplete="off" aria-invalid={!!f.name} />
          </Field>
          <Field label="Mobile" htmlFor="nb-phone" error={f.phone}>
            <Input id="nb-phone" name="phone" type="tel" inputMode="tel" autoComplete="off" dir="ltr" placeholder="050 123 4567" aria-invalid={!!f.phone} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="nb-notes">
          <Textarea id="nb-notes" name="notes" className="min-h-16" />
        </Field>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="notify" defaultChecked className="size-4 accent-sea" />
            Send WhatsApp confirmation
          </label>
          <label className="flex items-center gap-2">
            Language
            <select name="locale" defaultValue="ar" className="h-8 rounded-[8px] border border-mist bg-card px-2 text-[13px]">
              <option value="ar">Arabic</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
      </form>
    </Overlay>
  );
}
