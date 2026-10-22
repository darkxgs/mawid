import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "@/db";
import { getBusinessById } from "./catalog";

const COOKIE = "mawid_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s && process.env.VERCEL_ENV === "production") {
    // Still works, but tell whoever reads the logs.
    console.warn("[auth] AUTH_SECRET is not set; using a fallback derived from the deployment.");
  }
  return new TextEncoder().encode(s ?? `mawid-dev-secret-${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "local"}`);
}

export type Session = { userId: string; businessId: string };

export async function createSession(s: Session) {
  const token = await new SignJWT({ bid: s.businessId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.bid !== "string") return null;
    return { userId: payload.sub, businessId: payload.bid };
  } catch {
    return null;
  }
}

/** For dashboard pages and actions: the signed-in owner's business, or /login. */
export async function requireBusiness() {
  const session = await readSession();
  if (!session) redirect("/login");
  const db = await getDb();
  const business = await getBusinessById(db, session.businessId);
  if (!business || business.ownerId !== session.userId) redirect("/login");
  return { db, business, session };
}

export const SESSION_COOKIE = COOKIE;
