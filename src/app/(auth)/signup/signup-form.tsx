"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select, Spinner } from "@/components/ui";
import { signup } from "../actions";

const KINDS = [
  ["clinic", "Clinic"],
  ["salon", "Salon or barber"],
  ["spa", "Spa"],
  ["fitness", "Fitness studio"],
  ["other", "Something else"],
] as const;

export function SignupForm({ regions }: { regions: { code: string; label: string; currency: string }[] }) {
  const [state, action, pending] = useActionState(signup, null);
  const v = state?.values ?? {};
  const f = state?.fields ?? {};
  return (
    <form action={action} className="mt-8 grid gap-4" noValidate>
      <Field label="Your name" htmlFor="name" error={f.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={v.name} aria-invalid={!!f.name} />
      </Field>
      <Field label="Work email" htmlFor="email" error={f.email}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={v.email} aria-invalid={!!f.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={f.password} hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" aria-invalid={!!f.password} />
      </Field>
      <Field label="Business name" htmlFor="businessName" error={f.businessName}>
        <Input id="businessName" name="businessName" autoComplete="organization" defaultValue={v.businessName} aria-invalid={!!f.businessName} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue={v.kind ?? "clinic"}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country" htmlFor="region" hint="Sets your time zone, currency and working days.">
          <Select id="region" name="region" defaultValue={v.region ?? "AE"}>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" size="lg" className="mt-2" disabled={pending}>
        {pending ? <Spinner /> : null}
        Create account
      </Button>
    </form>
  );
}
