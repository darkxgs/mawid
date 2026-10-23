"use client";

import { enDate } from "@/lib/format";

import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { addTimeOff, removeTimeOff, saveStaff, setStaffActive, type ActionResult } from "@/app/dashboard/actions";
import { Avatar, Badge, Button, Field, Input, Spinner, cn } from "@/components/ui";
import { minutesToHHMM } from "@/lib/time";
import { EmptyState, Overlay, PageHeader } from "./common";

type Shift = { weekday: number; startMin: number; endMin: number };
type Member = {
  id: string;
  name: string;
  nameAr: string | null;
  title: string | null;
  titleAr: string | null;
  color: string;
  active: boolean;
  serviceIds: string[];
  hours: Shift[];
  timeOff: { id: string; from: string; to: string; reason: string | null }[];
};
type Svc = { id: string; name: string; active: boolean };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COLORS = ["#1D6B66", "#A86A1C", "#6B4E8C", "#3C6E9F", "#9C3D54", "#4E7A2E", "#5B5F66", "#B4532A"];
const RIBBON = { from: 6 * 60, to: 23 * 60 };

export function TeamView({ team, services, weekStart }: { team: Member[]; services: Svc[]; weekStart: 0 | 1 }) {
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [offFor, setOffFor] = useState<Member | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Team & hours"
        description="Working hours decide which times customers can book. Breaks between shifts stay closed."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add team member
          </Button>
        }
      />

      {team.length ? (
        <div className="mt-6 grid gap-4">
          {team.map((m) => {
            const weekly = m.hours.reduce((a, h) => a + h.endMin - h.startMin, 0);
            return (
              <section key={m.id} className={cn("rounded-panel border border-mist bg-card", !m.active && "opacity-70")}>
                <div className="flex flex-wrap items-center gap-4 border-b border-mist px-5 py-4">
                  <Avatar name={m.name} color={m.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="font-display text-[17px] font-semibold">{m.name}</span>
                      {!m.active ? <Badge>Not taking bookings</Badge> : null}
                    </p>
                    <p className="truncate text-[13.5px] text-muted">
                      {[m.title, `${Math.round(weekly / 60)} h a week`].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOffFor(m)}>
                      <CalendarOff className="size-4" /> Time off
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                      Edit
                    </Button>
                  </div>
                </div>

                <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <WeekRibbon hours={m.hours} days={days} color={m.color} />
                  <div className="grid content-start gap-4">
                    <div>
                      <p className="text-[12.5px] text-muted">Services</p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {m.serviceIds.length ? (
                          services
                            .filter((s) => m.serviceIds.includes(s.id))
                            .map((s) => (
                              <span key={s.id} className="rounded-full bg-mist-2 px-2.5 py-0.5 text-[12.5px]">
                                {s.name}
                              </span>
                            ))
                        ) : (
                          <span className="text-[13px] text-rose">No services yet, so nobody can book them.</span>
                        )}
                      </p>
                    </div>
                    {m.timeOff.length ? (
                      <div>
                        <p className="text-[12.5px] text-muted">Coming time off</p>
                        <ul className="mt-1 grid gap-1">
                          {m.timeOff.map((o) => (
                            <TimeOffRow key={o.id} item={o} />
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState title="Nobody on the team yet" action={<Button onClick={() => setEditing("new")}>Add a team member</Button>} />
        </div>
      )}

      <MemberDialog key={`member-${editing === "new" ? "new" : editing?.id ?? "none"}`} member={editing} services={services} days={days} onClose={() => setEditing(null)} />
      <TimeOffDialog key={`off-${offFor?.id ?? "none"}`} member={offFor} onClose={() => setOffFor(null)} />
    </div>
  );
}

function WeekRibbon({ hours, days, color }: { hours: Shift[]; days: number[]; color: string }) {
  const span = RIBBON.to - RIBBON.from;
  const pct = (m: number) => `${((Math.min(Math.max(m, RIBBON.from), RIBBON.to) - RIBBON.from) / span) * 100}%`;
  return (
    <div className="grid gap-1.5" aria-label="Weekly hours">
      {days.map((d) => {
        const shifts = hours.filter((h) => h.weekday === d).sort((a, b) => a.startMin - b.startMin);
        return (
          <div key={d} className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,190px)] items-center gap-3 text-[12.5px] max-sm:grid-cols-[36px_minmax(0,1fr)]">
            <span className={cn("text-muted", shifts.length && "text-ink-2")}>{DAY[d]}</span>
            <span className="relative h-2.5 rounded-full bg-mist-2">
              {shifts.map((s, i) => (
                <span key={i} className="absolute inset-y-0 rounded-full" style={{ insetInlineStart: pct(s.startMin), width: `calc(${pct(s.endMin)} - ${pct(s.startMin)})`, background: color }} />
              ))}
            </span>
            <span className="tnum truncate text-muted max-sm:hidden">
              {shifts.length ? shifts.map((s) => `${minutesToHHMM(s.startMin)}–${minutesToHHMM(s.endMin)}`).join(", ") : "Off"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TimeOffRow({ item }: { item: { id: string; from: string; to: string; reason: string | null } }) {
  const [pending, start] = useTransition();
  const fmt = (d: string) => enDate(d, { day: "numeric", month: "short" });
  return (
    <li className={cn("flex items-center gap-2 text-[13.5px]", pending && "opacity-50")}>
      <span className="tnum">{item.from === item.to ? fmt(item.from) : `${fmt(item.from)} to ${fmt(item.to)}`}</span>
      {item.reason ? <span className="truncate text-muted">{item.reason}</span> : null}
      <button type="button" onClick={() => start(async () => void (await removeTimeOff(item.id)))} aria-label="Remove time off" className="ms-auto grid size-7 place-items-center rounded-full text-muted hover:bg-rose-soft hover:text-rose">
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

const toHHMM = minutesToHHMM;
const fromHHMM = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + (m || 0);
};

function MemberDialog({ member, services, days, onClose }: { member: Member | "new" | null; services: Svc[]; days: number[]; onClose: () => void }) {
  const m = member && member !== "new" ? member : null;
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveStaff, null);
  const [color, setColor] = useState(m?.color ?? COLORS[0]);
  const [hours, setHours] = useState<Shift[]>(
    m?.hours ?? [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 })),
  );
  const [activePending, startActive] = useTransition();
  const f = state && !state.ok ? state.fields ?? {} : {};
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const update = (weekday: number, idx: number, patch: Partial<Shift>) =>
    setHours((hs) => {
      const day = hs.filter((h) => h.weekday === weekday);
      const rest = hs.filter((h) => h.weekday !== weekday);
      return [...rest, ...day.map((h, i) => (i === idx ? { ...h, ...patch } : h))];
    });

  return (
    <Overlay
      open={!!member}
      onClose={onClose}
      title={m ? `Edit ${m.name}` : "New team member"}
      width={640}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {state && !state.ok ? <p className="me-auto text-[13px] text-rose">{state.error}</p> : null}
          {m ? (
            <Button
              type="button"
              variant="ghost"
              className="me-auto"
              disabled={activePending}
              onClick={() => startActive(async () => { await setStaffActive(m.id, !m.active); onClose(); })}
            >
              {m.active ? "Stop taking bookings" : "Start taking bookings"}
            </Button>
          ) : null}
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form="member-form" disabled={pending}>
            {pending ? <Spinner /> : null}
            {m ? "Save" : "Add"}
          </Button>
        </div>
      }
    >
      <form id="member-form" action={action} className="grid gap-6">
        <input type="hidden" name="id" value={m?.id ?? ""} />
        <input type="hidden" name="hours" value={JSON.stringify(hours)} />
        <input type="hidden" name="color" value={color} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" htmlFor="tm-name" error={f.name}>
            <Input id="tm-name" name="name" defaultValue={m?.name} aria-invalid={!!f.name} />
          </Field>
          <Field label="Name (Arabic)" htmlFor="tm-name-ar">
            <Input id="tm-name-ar" name="nameAr" defaultValue={m?.nameAr ?? ""} dir="rtl" lang="ar" />
          </Field>
          <Field label="Role (English)" htmlFor="tm-title">
            <Input id="tm-title" name="title" defaultValue={m?.title ?? ""} placeholder="e.g. Orthodontist" />
          </Field>
          <Field label="Role (Arabic)" htmlFor="tm-title-ar">
            <Input id="tm-title-ar" name="titleAr" defaultValue={m?.titleAr ?? ""} dir="rtl" lang="ar" />
          </Field>
        </div>

        <fieldset>
          <legend className="text-[13px] font-medium text-ink-2">Colour on the schedule</legend>
          <div className="mt-2 flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                aria-pressed={color === c}
                className={cn("size-7 rounded-full ring-offset-2 transition-shadow", color === c && "ring-2 ring-ink")}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-medium text-ink-2">Working hours</legend>
          <div className="mt-2 divide-y divide-mist rounded-[14px] border border-mist">
            {days.map((d) => {
              const shifts = hours.filter((h) => h.weekday === d);
              const on = shifts.length > 0;
              return (
                <div key={d} className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-3 px-3 py-2.5">
                  <label className="flex h-9 items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setHours((hs) =>
                          e.target.checked ? [...hs, { weekday: d, startMin: 9 * 60, endMin: 17 * 60 }] : hs.filter((h) => h.weekday !== d),
                        )
                      }
                      className="size-4 accent-sea"
                    />
                    {DAY_LONG[d]}
                  </label>
                  {on ? (
                    <div className="grid gap-1.5">
                      {shifts.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input type="time" step={900} value={toHHMM(s.startMin)} onChange={(e) => update(d, i, { startMin: fromHHMM(e.target.value) })} className="tnum h-9 w-28" aria-label={`${DAY_LONG[d]} start`} />
                          <span className="text-muted">to</span>
                          <Input type="time" step={900} value={toHHMM(s.endMin)} onChange={(e) => update(d, i, { endMin: fromHHMM(e.target.value) })} className="tnum h-9 w-28" aria-label={`${DAY_LONG[d]} end`} />
                          {i === shifts.length - 1 && s.endMin < 22 * 60 ? (
                            <button
                              type="button"
                              onClick={() => setHours((hs) => [...hs, { weekday: d, startMin: Math.min(s.endMin + 60, 23 * 60), endMin: Math.min(s.endMin + 240, 24 * 60 - 1) }])}
                              className="ms-1 text-[13px] text-sea hover:underline"
                            >
                              Add shift
                            </button>
                          ) : null}
                          {shifts.length > 1 ? (
                            <button
                              type="button"
                              aria-label="Remove shift"
                              onClick={() => setHours((hs) => { const day = hs.filter((h) => h.weekday === d); return [...hs.filter((h) => h.weekday !== d), ...day.filter((_, j) => j !== i)]; })}
                              className="grid size-7 place-items-center rounded-full text-muted hover:bg-rose-soft hover:text-rose"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="h-9 text-[14px] leading-9 text-faint">Off</span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-medium text-ink-2">Services they do</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {services.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-mist px-3 py-1.5 text-[13.5px] has-checked:border-sea has-checked:bg-sea-soft">
                <input type="checkbox" name="services" value={s.id} defaultChecked={m?.serviceIds.includes(s.id) ?? true} className="sr-only" />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Overlay>
  );
}

function TimeOffDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addTimeOff, null);
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);
  return (
    <Overlay
      open={!!member}
      onClose={onClose}
      title={member ? `Time off for ${member.name}` : ""}
      width={460}
      footer={
        <div className="flex items-center justify-end gap-2">
          {state && !state.ok ? <p className="me-auto text-[13px] text-rose">{state.error}</p> : null}
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form="off-form" disabled={pending}>
            {pending ? <Spinner /> : null}
            Add time off
          </Button>
        </div>
      }
    >
      <form id="off-form" action={action} className="grid gap-4">
        <input type="hidden" name="staffId" value={member?.id ?? ""} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="First day" htmlFor="off-from">
            <Input id="off-from" name="from" type="date" required />
          </Field>
          <Field label="Last day" htmlFor="off-to">
            <Input id="off-to" name="to" type="date" required />
          </Field>
        </div>
        <Field label="Reason (only your team sees this)" htmlFor="off-reason">
          <Input id="off-reason" name="reason" placeholder="Annual leave, conference…" />
        </Field>
        <p className="text-[13px] text-muted">Existing appointments on these days stay booked. Move or cancel them from Bookings.</p>
      </form>
    </Overlay>
  );
}
