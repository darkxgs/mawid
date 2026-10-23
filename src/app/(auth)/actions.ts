"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { DEMO } from "@/db/seed";
import { createAccount, EmailTakenError, REGIONS, verifyLogin, type RegionCode } from "@/server/accounts";
import { createSession, destroySession } from "@/server/auth";

export type FormState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> } | null;

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/dashboard") ? s : "/dashboard";
};

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", values: { email } };
  const session = await verifyLogin(await getDb(), email, password);
  if (!session) return { error: "That email and password don't match an account.", values: { email } };
  await createSession(session);
  redirect(safeNext(form.get("next")));
}

export async function demoLogin(form: FormData) {
  const db = await getDb();
  const session = await verifyLogin(db, DEMO.email, DEMO.password);
  if (!session) redirect("/login?demo=missing");
  await createSession(session);
  redirect(safeNext(form.get("next")));
}

const Signup = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.email("Enter a valid email.").max(120),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
  businessName: z.string().trim().min(2, "Enter your business name.").max(80),
  region: z.enum(Object.keys(REGIONS) as [RegionCode, ...RegionCode[]]),
  kind: z.enum(["clinic", "salon", "spa", "fitness", "other"]),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = Signup.safeParse(raw);
  const values = { ...raw, password: "" };
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return { fields: Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? "Check this field."])), values };
  }
  try {
    const acct = await createAccount(await getDb(), parsed.data);
    await createSession({ userId: acct.userId, businessId: acct.businessId });
  } catch (e) {
    if (e instanceof EmailTakenError) return { fields: { email: "There's already an account with this email. Sign in instead." }, values };
    throw e;
  }
  redirect("/dashboard?welcome=1");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
