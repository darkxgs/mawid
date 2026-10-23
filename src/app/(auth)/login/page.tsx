import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-[30px] leading-tight font-medium">Sign in</h1>
      <p className="mt-2 text-[15px] text-muted">
        New to Mawid?{" "}
        <Link href="/signup" className="font-medium text-sea underline-offset-4 hover:underline">
          Create a free account
        </Link>
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
