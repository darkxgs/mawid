"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { businesses, services, staff, staffServices, timeOff, workingHours } from "@/db/schema";
import { getCatalog } from "@/server/catalog";
import { confirmHold, holdSlot, setBookingStatus } from "@/server/bookings";
import { BookingError } from "@/server/errors";
import { notifyBooking } from "@/server/notify";
import { requireBusiness } from "@/server/auth";
import { uniqueSlug } from "@/server/accounts";
import { getBookingMessages } from "@/server/dashboard";
import { currencyCountry, normalizePhone } from "@/lib/phone";
import { newId } from "@/lib/id";
import { isDateStr, zonedToUtc } from "@/lib/time";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fields?: Record<string, string> };

const fail = (error: string, fields?: Record<string, string>): ActionResult => ({ ok: false, error, fields });

const BOOKING_ERRORS: Record<string, string> = {
  slot_taken: "That time was just taken. Pick another.",
  not_available: "That time isn't free for this person.",
  hold_expired: "That time was taken. Pick another.",
  not_found: "Couldn't find that booking.",
  invalid: "That change isn't possible for this booking.",
  too_late: "It's too late to change this booking.",
};

/* -------------------------- bookings ------------------------------ */

export async function setStatus(bookingId: string, status: "confirmed" | "completed" | "cancelled" | "no_show"): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  try {
    const row = await setBookingStatus(db, business.id, bookingId, status);
    if (status === "cancelled") after(() => notifyBooking(db, row.id, "cancellation"));
  } catch (e) {
    if (e instanceof BookingError) return fail(BOOKING_ERRORS[e.code] ?? "Couldn't update the booking.");
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function bookingMessages(bookingId: string) {
  const { db, business } = await requireBusiness();
  return getBookingMessages(db, business.id, bookingId);
}

const NewBooking = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().optional().default(""),
  startsAt: z.iso.datetime({ message: "Pick a time." }),
  name: z.string().trim().min(2, "Enter the customer's name.").max(80),
  phone: z.string().trim().min(6, "Enter a phone number.").max(24),
  notes: z.string().trim().max(500).optional(),
  notify: z.string().optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
});

/** Phone and walk-in bookings made by staff. Same guards as online bookings. */
export async function createBooking(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  const parsed = NewBooking.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return fail("Check the highlighted fields.", Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? "Check this."])));
  }
  const d = parsed.data;
  const phone = normalizePhone(d.phone, currencyCountry[business.currency] ?? "AE");
  if (!phone) return fail("Check the highlighted fields.", { phone: "That doesn't look like a phone number." });
  try {
    const catalog = await getCatalog(db, business);
    const hold = await holdSlot(db, business, catalog, {
      serviceId: d.serviceId,
      staffId: d.staffId || null,
      startsAt: new Date(d.startsAt),
      locale: d.locale,
      source: "dashboard",
      // Staff can book inside the notice window (e.g. a walk-in right now).
      rules: { timezone: business.timezone, slotIntervalMin: business.slotIntervalMin, minNoticeMin: 0, maxAdvanceDays: 365 },
    });
    const booking = await confirmHold(db, business, {
      bookingId: hold.id,
      token: hold.manageToken,
      customer: { name: d.name, phone },
      notes: d.notes || null,
    });
    if (d.notify === "on") after(() => notifyBooking(db, booking.id, "confirmation"));
  } catch (e) {
    if (e instanceof BookingError) return fail(BOOKING_ERRORS[e.code] ?? "Couldn't book that time.");
    throw e;
  }
  refresh();
  return { ok: true, message: "Booked." };
}

/* -------------------------- services ------------------------------ */

const ServiceForm = z.object({
  id: z.string().optional().default(""),
  name: z.string().trim().min(2, "Enter a name.").max(80),
  nameAr: z.string().trim().max(80).optional(),
  description: z.string().trim().max(200).optional(),
  descriptionAr: z.string().trim().max(200).optional(),
  durationMin: z.coerce.number().int().min(5, "At least 5 minutes.").max(600),
  bufferAfterMin: z.coerce.number().int().min(0).max(240),
  price: z.coerce.number().min(0).max(1_000_000),
  active: z.string().optional(),
});

export async function saveService(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  const parsed = ServiceForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return fail("Check the highlighted fields.", Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? "Check this."])));
  }
  const d = parsed.data;
  const staffIds = form.getAll("staff").map(String);
  const values = {
    name: d.name,
    nameAr: d.nameAr || null,
    description: d.description || null,
    descriptionAr: d.descriptionAr || null,
    durationMin: d.durationMin,
    bufferAfterMin: d.bufferAfterMin,
    priceMinor: Math.round(d.price * 100),
    active: d.active === "on",
  };
  const team = await db.select({ id: staff.id }).from(staff).where(eq(staff.businessId, business.id));
  const allowed = staffIds.filter((id) => team.some((t) => t.id === id));

  await db.transaction(async (tx) => {
    let id = d.id;
    if (id) {
      const [row] = await tx
        .update(services)
        .set(values)
        .where(and(eq(services.id, id), eq(services.businessId, business.id)))
        .returning({ id: services.id });
      if (!row) throw new Error("not found");
    } else {
      id = newId("svc");
      const existing = await tx.select({ id: services.id }).from(services).where(eq(services.businessId, business.id));
      await tx.insert(services).values({ id, businessId: business.id, position: existing.length, ...values });
    }
    if (team.length) {
      await tx.delete(staffServices).where(and(eq(staffServices.serviceId, id), inArray(staffServices.staffId, team.map((t) => t.id))));
    }
    if (allowed.length) await tx.insert(staffServices).values(allowed.map((staffId) => ({ staffId, serviceId: id })));
  });
  refresh();
  return { ok: true, message: d.id ? "Service saved." : "Service added." };
}

/* -------------------------- team ---------------------------------- */

const Hours = z.array(z.object({ weekday: z.number().int().min(0).max(6), startMin: z.number().int().min(0).max(1440), endMin: z.number().int().min(0).max(1440) }));

const StaffForm = z.object({
  id: z.string().optional().default(""),
  name: z.string().trim().min(2, "Enter a name.").max(80),
  nameAr: z.string().trim().max(80).optional(),
  title: z.string().trim().max(80).optional(),
  titleAr: z.string().trim().max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1D6B66"),
  hours: z.string().default("[]"),
});

export async function saveStaff(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  const parsed = StaffForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return fail("Check the highlighted fields.", Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? "Check this."])));
  }
  const d = parsed.data;
  const hours = Hours.safeParse(JSON.parse(d.hours));
  if (!hours.success) return fail("The working hours aren't valid.");
  for (const h of hours.data) if (h.endMin <= h.startMin) return fail("Each shift has to end after it starts.");
  const byDay = Object.groupBy(hours.data, (h) => h.weekday);
  for (const list of Object.values(byDay)) {
    const sorted = [...(list ?? [])].sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].startMin < sorted[i - 1].endMin) return fail("Two shifts on the same day overlap.");
  }
  const serviceIds = form.getAll("services").map(String);
  const own = await db.select({ id: services.id }).from(services).where(eq(services.businessId, business.id));
  const allowed = serviceIds.filter((id) => own.some((s) => s.id === id));

  await db.transaction(async (tx) => {
    let id = d.id;
    const values = { name: d.name, nameAr: d.nameAr || null, title: d.title || null, titleAr: d.titleAr || null, color: d.color };
    if (id) {
      const [row] = await tx.update(staff).set(values).where(and(eq(staff.id, id), eq(staff.businessId, business.id))).returning({ id: staff.id });
      if (!row) throw new Error("not found");
    } else {
      id = newId("stf");
      const existing = await tx.select({ id: staff.id }).from(staff).where(eq(staff.businessId, business.id));
      await tx.insert(staff).values({ id, businessId: business.id, position: existing.length, ...values });
    }
    await tx.delete(workingHours).where(eq(workingHours.staffId, id));
    if (hours.data.length) await tx.insert(workingHours).values(hours.data.map((h) => ({ id: newId("wh"), staffId: id, ...h })));
    await tx.delete(staffServices).where(eq(staffServices.staffId, id));
    if (allowed.length) await tx.insert(staffServices).values(allowed.map((serviceId) => ({ staffId: id, serviceId })));
  });
  refresh();
  return { ok: true, message: d.id ? "Saved." : "Team member added." };
}

export async function setStaffActive(staffId: string, active: boolean): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  await db.update(staff).set({ active }).where(and(eq(staff.id, staffId), eq(staff.businessId, business.id)));
  refresh();
  return { ok: true };
}

const TimeOffForm = z.object({
  staffId: z.string().min(1),
  from: z.string().refine(isDateStr, "Pick a start date."),
  to: z.string().refine(isDateStr, "Pick an end date."),
  reason: z.string().trim().max(120).optional(),
});

export async function addTimeOff(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  const parsed = TimeOffForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Pick the dates.");
  const d = parsed.data;
  if (d.to < d.from) return fail("The end date is before the start date.");
  const [member] = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, d.staffId), eq(staff.businessId, business.id)));
  if (!member) return fail("Unknown team member.");
  const end = new Date(zonedToUtc(d.to, 0, business.timezone).getTime() + 86_400_000);
  await db.insert(timeOff).values({
    id: newId("off"),
    staffId: d.staffId,
    startsAt: zonedToUtc(d.from, 0, business.timezone),
    endsAt: end,
    reason: d.reason || null,
  });
  refresh();
  return { ok: true, message: "Time off added. Those days are closed for booking." };
}

export async function removeTimeOff(id: string): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  const team = await db.select({ id: staff.id }).from(staff).where(eq(staff.businessId, business.id));
  if (team.length) await db.delete(timeOff).where(and(eq(timeOff.id, id), inArray(timeOff.staffId, team.map((t) => t.id))));
  refresh();
  return { ok: true };
}

/* -------------------------- settings ------------------------------ */

const Settings = z.object({
  name: z.string().trim().min(2, "Enter a name.").max(80),
  nameAr: z.string().trim().max(80).optional(),
  tagline: z.string().trim().max(120).optional(),
  taglineAr: z.string().trim().max(120).optional(),
  address: z.string().trim().max(160).optional(),
  addressAr: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(30).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Use 3 to 40 letters, numbers or dashes."),
  defaultLocale: z.enum(["ar", "en"]),
  slotIntervalMin: z.coerce.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v)),
  minNoticeMin: z.coerce.number().int().min(0).max(7 * 24 * 60),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  holdMinutes: z.coerce.number().int().min(2).max(30),
  cancelWindowHours: z.coerce.number().int().min(0).max(168),
  whatsappEnabled: z.string().optional(),
});

export async function saveSettings(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { db, business } = await requireBusiness();
  const parsed = Settings.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return fail("Check the highlighted fields.", Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? "Check this."])));
  }
  const d = parsed.data;
  if (d.slug !== business.slug) {
    const free = await uniqueSlug(db, d.slug, business.id);
    if (free !== d.slug) return fail("Check the highlighted fields.", { slug: "That link is taken." });
  }
  await db
    .update(businesses)
    .set({
      name: d.name,
      nameAr: d.nameAr || null,
      tagline: d.tagline || null,
      taglineAr: d.taglineAr || null,
      address: d.address || null,
      addressAr: d.addressAr || null,
      phone: d.phone || null,
      slug: d.slug,
      defaultLocale: d.defaultLocale,
      slotIntervalMin: d.slotIntervalMin,
      minNoticeMin: d.minNoticeMin,
      maxAdvanceDays: d.maxAdvanceDays,
      holdMinutes: d.holdMinutes,
      cancelWindowHours: d.cancelWindowHours,
      whatsappEnabled: d.whatsappEnabled === "on",
    })
    .where(eq(businesses.id, business.id));
  refresh();
  return { ok: true, message: "Settings saved." };
}
