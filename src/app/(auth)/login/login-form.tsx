"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { demoLogin, login } from "../actions";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action, pending] = useActionState(login, null);
  return (
    <div className="mt-8">
      <form action={demoLogin}>
        <input type="hidden" name="next" value={next} />
        <DemoButton />
      </form>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Opens Noor Dental Clinic, a sample clinic with months of bookings already in it. Anything you change there is visible to other visitors.
      </p>

      <div className="my-8 flex items-center gap-3 text-[13px] text-faint">
        <span className="h-px flex-1 bg-mist" />
        or with your account
        <span className="h-px flex-1 bg-mist" />
      </div>

      <form action={action} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state?.error ? (
          <p role="alert" className="rounded-control bg-rose-soft px-3 py-2.5 text-[14px] text-rose">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="dark" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          Sign in
        </Button>
      </form>
    </div>
  );
}

function DemoButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Spinner /> : null}
      Open the demo clinic
    </Button>
  );
}
