"use client";

import { Check, Copy, Download } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { saveSettings, type ActionResult } from "@/app/dashboard/actions";
import { Button, Field, Input, Select, Spinner } from "@/components/ui";
import { PageHeader } from "./common";

type B = {
  name: string;
  nameAr: string | null;
  tagline: string | null;
  taglineAr: string | null;
  address: string | null;
  addressAr: string | null;
  phone: string | null;
  slug: string;
  defaultLocale: string;
  slotIntervalMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  holdMinutes: number;
  cancelWindowHours: number;
  whatsappEnabled: boolean;
  timezone: string;
  currency: string;
};

const NOTICE = [
  [0, "No minimum"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [720, "12 hours"],
  [1440, "1 day"],
  [2880, "2 days"],
] as const;

export function SettingsView({ business: b, base, qr }: { business: B; base: string; qr: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveSettings, null);
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState(b.slug);
  const f = state && !state.ok ? state.fields ?? {} : {};
  const link = `${base}/b/${b.slug}`;

  function downloadQr() {
    const blob = new Blob([qr], { type: "image/svg+xml" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${b.slug}-booking-qr.svg` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Settings" description={`Time zone ${b.timezone.replace("_", " ")}, prices in ${b.currency}.`} />

      <section className="mt-6 grid gap-6 rounded-panel border border-mist bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-6">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium">Your booking link</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
            Put it in your Instagram bio, WhatsApp Business profile and Google Maps listing. Print the QR code for the reception desk.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded-[8px] bg-mist-2 px-3 py-2 text-[13.5px]">{link}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" className="text-[13.5px] font-medium text-sea hover:underline">
              Open
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:flex-col sm:items-end">
          <div className="size-28 rounded-[12px] border border-mist bg-white p-2.5" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code for the booking link" role="img" />
          <Button variant="ghost" size="sm" onClick={downloadQr}>
            <Download className="size-3.5" /> QR code
          </Button>
        </div>
      </section>

      <form action={action} className="mt-6 grid gap-6">
        <Section title="Business details" description="Shown at the top of your booking page and in customer messages.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (English)" htmlFor="s-name" error={f.name}>
              <Input id="s-name" name="name" defaultValue={b.name} aria-invalid={!!f.name} />
            </Field>
            <Field label="Name (Arabic)" htmlFor="s-name-ar">
              <Input id="s-name-ar" name="nameAr" defaultValue={b.nameAr ?? ""} dir="rtl" lang="ar" />
            </Field>
            <Field label="One line about you (English)" htmlFor="s-tag">
              <Input id="s-tag" name="tagline" defaultValue={b.tagline ?? ""} />
            </Field>
            <Field label="One line about you (Arabic)" htmlFor="s-tag-ar">
              <Input id="s-tag-ar" name="taglineAr" defaultValue={b.taglineAr ?? ""} dir="rtl" lang="ar" />
            </Field>
            <Field label="Address (English)" htmlFor="s-addr">
              <Input id="s-addr" name="address" defaultValue={b.address ?? ""} />
            </Field>
            <Field label="Address (Arabic)" htmlFor="s-addr-ar">
              <Input id="s-addr-ar" name="addressAr" defaultValue={b.addressAr ?? ""} dir="rtl" lang="ar" />
            </Field>
            <Field label="Phone shown to customers" htmlFor="s-phone">
              <Input id="s-phone" name="phone" type="tel" defaultValue={b.phone ?? ""} dir="ltr" />
            </Field>
            <Field label="Booking page language" htmlFor="s-locale" hint="Customers can switch either way.">
              <Select id="s-locale" name="defaultLocale" defaultValue={b.defaultLocale}>
                <option value="ar">Arabic first</option>
                <option value="en">English first</option>
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Link address" description="Changing it breaks links you already shared.">
          <Field label="Address" htmlFor="s-slug" error={f.slug}>
            <div className="flex items-center rounded-control border border-mist bg-card focus-within:border-sea focus-within:ring-4 focus-within:ring-sea/10">
              <span className="ps-3 text-[14px] whitespace-nowrap text-muted">{base.replace(/^https?:\/\//, "")}/b/</span>
              <input
                id="s-slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="h-11 min-w-0 flex-1 bg-transparent pe-3 text-[15px] focus:outline-none"
                aria-invalid={!!f.slug}
              />
            </div>
          </Field>
        </Section>

        <Section title="Booking rules" description="These shape which times customers see.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Start times every" htmlFor="s-int">
              <Select id="s-int" name="slotIntervalMin" defaultValue={String(b.slotIntervalMin)}>
                {[5, 10, 15, 20, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {m === 60 ? "hour" : `${m} minutes`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minimum notice" htmlFor="s-notice" hint="How soon someone can book online.">
              <Select id="s-notice" name="minNoticeMin" defaultValue={String(b.minNoticeMin)}>
                {NOTICE.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Book up to (days ahead)" htmlFor="s-adv" error={f.maxAdvanceDays}>
              <Input id="s-adv" name="maxAdvanceDays" type="number" min={1} max={365} defaultValue={b.maxAdvanceDays} className="tnum" />
            </Field>
            <Field label="Hold a time while someone books" htmlFor="s-hold">
              <Select id="s-hold" name="holdMinutes" defaultValue={String(b.holdMinutes)}>
                {[3, 5, 8, 10, 15].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Customers can change or cancel until" htmlFor="s-cancel">
              <Select id="s-cancel" name="cancelWindowHours" defaultValue={String(b.cancelWindowHours)}>
                {[0, 1, 2, 4, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h === 0 ? "the start time" : `${h} hour${h === 1 ? "" : "s"} before`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Customer messages" description="Confirmations go out straight away. Reminders go a day before and on the day.">
          <label className="flex items-start gap-3 text-[14px]">
            <input type="checkbox" name="whatsappEnabled" defaultChecked={b.whatsappEnabled} className="mt-0.5 size-4 accent-sea" />
            <span>
              Send WhatsApp messages
              <span className="block text-[13px] text-muted">Customers who give an email also get the same message by email.</span>
            </span>
          </label>
        </Section>

        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-mist bg-paper/90 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
          {state ? (
            <p role="status" className={state.ok ? "me-auto text-[14px] text-sea" : "me-auto text-[14px] text-rose"}>
              {state.ok ? state.message : state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner /> : null}
            Save settings
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 rounded-panel border border-mist bg-card p-5 sm:p-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-medium">{title}</h2>
        {description ? <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
