"use client";

import { Link2, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { saveService, type ActionResult } from "@/app/dashboard/actions";
import { Avatar, Badge, Button, Field, Input, Spinner, Textarea, cn } from "@/components/ui";
import { formatDuration, formatMoney } from "@/lib/format";
import { EmptyState, Overlay, PageHeader } from "./common";

type Svc = {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  durationMin: number;
  bufferAfterMin: number;
  priceMinor: number;
  active: boolean;
  staffIds: string[];
};
type Member = { id: string; name: string; color: string };

export function ServicesView({ services, team, currency, slug }: { services: Svc[]; team: Member[]; currency: string; slug: string }) {
  const [editing, setEditing] = useState<Svc | "new" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copyLink(id: string) {
    void navigator.clipboard.writeText(`${window.location.origin}/b/${slug}?service=${id}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Services"
        description="What customers can book, how long it takes and who does it. The gap after a visit keeps time for cleaning up and isn't shown to customers."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add service
          </Button>
        }
      />

      {services.length ? (
        <ul className="mt-6 divide-y divide-mist overflow-hidden rounded-panel border border-mist bg-card">
          {services.map((s) => (
            <li key={s.id} className={cn("grid items-center gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_120px_110px_auto]", !s.active && "bg-paper/60")}>
              <button type="button" onClick={() => setEditing(s)} className="min-w-0 text-start">
                <span className="flex items-center gap-2">
                  <span className="font-display truncate text-[16px] font-medium hover:text-sea">{s.name}</span>
                  {!s.active ? <Badge>Hidden</Badge> : null}
                </span>
                <span className="mt-0.5 block truncate text-[13.5px] text-muted">
                  <bdi dir="auto">{s.nameAr || s.description}</bdi>
                </span>
              </button>
              <span className="tnum text-[14px]">
                {formatDuration(s.durationMin, "en")}
                {s.bufferAfterMin ? <span className="block text-[12.5px] text-muted">+{s.bufferAfterMin} min gap</span> : null}
              </span>
              <span className="tnum text-[14px]">{s.priceMinor ? formatMoney(s.priceMinor, currency, "en") : "Free"}</span>
              <span className="flex items-center gap-3 sm:justify-end">
                <span className="flex gap-1">
                  {s.staffIds.length ? (
                    team.filter((m) => s.staffIds.includes(m.id)).map((m) => <Avatar key={m.id} name={m.name} color={m.color} size={24} />)
                  ) : (
                    <span className="text-[12.5px] text-rose">Nobody assigned</span>
                  )}
                </span>
                <button type="button" onClick={() => copyLink(s.id)} title="Copy a booking link for this service" className="grid size-8 place-items-center rounded-full text-muted hover:bg-mist-2 hover:text-ink">
                  <Link2 className="size-4" aria-hidden />
                  <span className="sr-only">Copy booking link</span>
                </button>
                {copied === s.id ? <span className="text-[12px] text-sea">Copied</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="No services yet" action={<Button onClick={() => setEditing("new")}>Add your first service</Button>}>
            Add what people book with you. You can show it in Arabic and English.
          </EmptyState>
        </div>
      )}

      <ServiceDialog key={editing === "new" ? "new" : editing?.id ?? "none"} service={editing} team={team} onClose={() => setEditing(null)} currency={currency} />
    </div>
  );
}

function ServiceDialog({ service, team, onClose, currency }: { service: Svc | "new" | null; team: Member[]; onClose: () => void; currency: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveService, null);
  const s = service && service !== "new" ? service : null;
  const f = state && !state.ok ? state.fields ?? {} : {};
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <Overlay
      open={!!service}
      onClose={onClose}
      title={s ? "Edit service" : "New service"}
      width={600}
      footer={
        <div className="flex items-center justify-end gap-2">
          {state && !state.ok ? <p className="me-auto text-[13px] text-rose">{state.error}</p> : null}
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form="service-form" disabled={pending}>
            {pending ? <Spinner /> : null}
            {s ? "Save" : "Add service"}
          </Button>
        </div>
      }
    >
      <form id="service-form" action={action} className="grid gap-5">
        <input type="hidden" name="id" value={s?.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" htmlFor="sv-name" error={f.name}>
            <Input id="sv-name" name="name" defaultValue={s?.name} aria-invalid={!!f.name} />
          </Field>
          <Field label="Name (Arabic)" htmlFor="sv-name-ar">
            <Input id="sv-name-ar" name="nameAr" defaultValue={s?.nameAr ?? ""} dir="rtl" lang="ar" />
          </Field>
          <Field label="Short description (English)" htmlFor="sv-desc">
            <Textarea id="sv-desc" name="description" defaultValue={s?.description ?? ""} className="min-h-16" />
          </Field>
          <Field label="Short description (Arabic)" htmlFor="sv-desc-ar">
            <Textarea id="sv-desc-ar" name="descriptionAr" defaultValue={s?.descriptionAr ?? ""} className="min-h-16" dir="rtl" lang="ar" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Length (minutes)" htmlFor="sv-dur" error={f.durationMin}>
            <Input id="sv-dur" name="durationMin" type="number" min={5} step={5} defaultValue={s?.durationMin ?? 30} className="tnum" />
          </Field>
          <Field label="Gap after (minutes)" htmlFor="sv-buf" hint="Cleaning, notes">
            <Input id="sv-buf" name="bufferAfterMin" type="number" min={0} step={5} defaultValue={s?.bufferAfterMin ?? 0} className="tnum" />
          </Field>
          <Field label={`Price (${currency})`} htmlFor="sv-price" error={f.price}>
            <Input id="sv-price" name="price" type="number" min={0} step="0.5" defaultValue={s ? s.priceMinor / 100 : 0} className="tnum" />
          </Field>
        </div>
        <fieldset>
          <legend className="text-[13px] font-medium text-ink-2">Who does it</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {team.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-mist py-1 ps-1 pe-3 text-[13.5px] has-checked:border-sea has-checked:bg-sea-soft">
                <input type="checkbox" name="staff" value={m.id} defaultChecked={s ? s.staffIds.includes(m.id) : true} className="sr-only" />
                <Avatar name={m.name} color={m.color} size={24} />
                {m.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" name="active" defaultChecked={s ? s.active : true} className="size-4 accent-sea" />
          Show on the booking page
        </label>
      </form>
    </Overlay>
  );
}
