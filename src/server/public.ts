import "server-only";
import type { Business } from "@/db/schema";
import type { Catalog } from "./catalog";
import type { DayAvailability } from "@/lib/availability";
import { BookingError } from "./errors";

/** What the public booking page is allowed to know about a business. */
export function publicBusiness(b: Business, catalog: Catalog) {
  return {
    slug: b.slug,
    name: b.name,
    nameAr: b.nameAr,
    kind: b.kind,
    tagline: b.tagline,
    taglineAr: b.taglineAr,
    address: b.address,
    addressAr: b.addressAr,
    phone: b.phone,
    timezone: b.timezone,
    currency: b.currency,
    defaultLocale: (b.defaultLocale === "en" ? "en" : "ar") as "ar" | "en",
    maxAdvanceDays: b.maxAdvanceDays,
    holdMinutes: b.holdMinutes,
    cancelWindowHours: b.cancelWindowHours,
    services: catalog.services
      .filter((s) => catalog.staff.some((st) => st.serviceIds.includes(s.id)))
      .map((s) => ({
        id: s.id,
        name: s.name,
        nameAr: s.nameAr,
        description: s.description,
        descriptionAr: s.descriptionAr,
        durationMin: s.durationMin,
        priceMinor: s.priceMinor,
      })),
    staff: catalog.staff.map((s) => ({
      id: s.id,
      name: s.name,
      nameAr: s.nameAr,
      title: s.title,
      titleAr: s.titleAr,
      color: s.color,
      serviceIds: s.serviceIds,
    })),
  };
}

export type PublicBusiness = ReturnType<typeof publicBusiness>;

export function serializeDays(days: DayAvailability[]) {
  return days.map((d) => ({
    date: d.date,
    closed: d.closed,
    capacityMin: d.capacityMin,
    bookedMin: d.bookedMin,
    slots: d.slots.map((s) => ({ start: s.start.toISOString(), staffIds: s.staffIds })),
  }));
}

export type SerializedDay = ReturnType<typeof serializeDays>[number];

export function errorResponse(err: unknown) {
  if (err instanceof BookingError) {
    const status = err.code === "not_found" ? 404 : err.code === "invalid" ? 400 : 409;
    return Response.json({ error: err.code }, { status });
  }
  console.error(err);
  return Response.json({ error: "server_error" }, { status: 500 });
}
