import "server-only";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { businesses, services, staff, staffServices, users, workingHours } from "@/db/schema";
import { newId } from "@/lib/id";

export const REGIONS = {
  AE: { label: "United Arab Emirates", tz: "Asia/Dubai", currency: "AED", workdays: [1, 2, 3, 4, 5] },
  SA: { label: "Saudi Arabia", tz: "Asia/Riyadh", currency: "SAR", workdays: [0, 1, 2, 3, 4] },
  QA: { label: "Qatar", tz: "Asia/Qatar", currency: "QAR", workdays: [0, 1, 2, 3, 4] },
  KW: { label: "Kuwait", tz: "Asia/Kuwait", currency: "KWD", workdays: [0, 1, 2, 3, 4] },
  BH: { label: "Bahrain", tz: "Asia/Bahrain", currency: "BHD", workdays: [0, 1, 2, 3, 4] },
  OM: { label: "Oman", tz: "Asia/Muscat", currency: "OMR", workdays: [0, 1, 2, 3, 4] },
  EG: { label: "Egypt", tz: "Africa/Cairo", currency: "EGP", workdays: [0, 1, 2, 3, 4, 6] },
} as const;
export type RegionCode = keyof typeof REGIONS;

let dummy: string | undefined;
const dummyHash = () => (dummy ??= bcrypt.hashSync("not-a-real-password", 10));

export async function verifyLogin(db: DB, email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase())).limit(1);
  // Compare against a dummy hash when the user is missing so timing doesn't leak which emails exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash());
  if (!user || !ok) return null;
  const [biz] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerId, user.id)).limit(1);
  return biz ? { userId: user.id, businessId: biz.id } : null;
}

function slugify(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function uniqueSlug(db: DB, name: string, exceptId?: string) {
  const base = slugify(name) || "booking";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, candidate)).limit(1);
    if (!hit || hit.id === exceptId) return candidate;
  }
  return `${base}-${newId("x").slice(-6)}`;
}

export class EmailTakenError extends Error {}

/**
 * A new owner gets a working setup straight away: one team member (them),
 * regional working days, and a starter service, so the booking page is live
 * from the first minute and they edit rather than build from nothing.
 */
export async function createAccount(
  db: DB,
  input: { name: string; email: string; password: string; businessName: string; region: RegionCode; kind: string },
) {
  const region = REGIONS[input.region];
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, input.email.toLowerCase())).limit(1);
  if (exists) throw new EmailTakenError();

  const userId = newId("usr");
  const businessId = newId("biz");
  const staffId = newId("stf");
  const serviceId = newId("svc");
  const slug = await uniqueSlug(db, input.businessName);
  const hash = await bcrypt.hash(input.password, 10);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email: input.email.toLowerCase(), name: input.name, passwordHash: hash });
    await tx.insert(businesses).values({
      id: businessId,
      ownerId: userId,
      slug,
      name: input.businessName,
      kind: input.kind,
      timezone: region.tz,
      currency: region.currency,
      defaultLocale: "ar",
    });
    await tx.insert(staff).values({ id: staffId, businessId, name: input.name, color: "#1D6B66", position: 0 });
    await tx.insert(services).values({
      id: serviceId,
      businessId,
      name: "Consultation",
      nameAr: "استشارة",
      durationMin: 30,
      bufferAfterMin: 10,
      priceMinor: 0,
      position: 0,
    });
    await tx.insert(staffServices).values({ staffId, serviceId });
    await tx.insert(workingHours).values(
      region.workdays.map((weekday) => ({ id: newId("wh"), staffId, weekday, startMin: 9 * 60, endMin: 17 * 60 })),
    );
  });
  return { userId, businessId, slug };
}
