import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";
import { REGIONS } from "@/server/accounts";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  const regions = Object.entries(REGIONS).map(([code, r]) => ({ code, label: r.label, currency: r.currency }));
  return (
    <>
      <h1 className="font-display text-[30px] leading-tight font-medium">Start taking bookings</h1>
      <p className="mt-2 text-[15px] text-muted">
        Your booking page is live as soon as you finish. Already have an account?{" "}
        <Link href="/login" className="font-medium text-sea underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <SignupForm regions={regions} />
    </>
  );
}
