import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { businesses, services, staff, staffServices, workingHours, type Business } from "@/db/schema";

export async function getBusinessBySlug(db: DB, slug: string) {
  const [b] = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  return b ?? null;
}

export async function getBusinessById(db: DB, id: string) {
  const [b] = await db.select().from(businesses).where(eq(businesses.id, id)).limit(1);
  return b ?? null;
}

export async function getCatalog(db: DB, business: Business, opts: { includeInactive?: boolean } = {}) {
  const activeOnly = !opts.includeInactive;
  const [svc, team] = await Promise.all([
    db
      .select()
      .from(services)
      .where(activeOnly ? and(eq(services.businessId, business.id), eq(services.active, true)) : eq(services.businessId, business.id))
      .orderBy(asc(services.position), asc(services.createdAt)),
    db
      .select()
      .from(staff)
      .where(activeOnly ? and(eq(staff.businessId, business.id), eq(staff.active, true)) : eq(staff.businessId, business.id))
      .orderBy(asc(staff.position), asc(staff.createdAt)),
  ]);
  const staffIds = team.map((s) => s.id);
  const [links, hours] = staffIds.length
    ? await Promise.all([
        db.select().from(staffServices).where(inArray(staffServices.staffId, staffIds)),
        db.select().from(workingHours).where(inArray(workingHours.staffId, staffIds)),
      ])
    : [[], []];

  const servicesByStaff = new Map<string, Set<string>>();
  for (const l of links) {
    if (!servicesByStaff.has(l.staffId)) servicesByStaff.set(l.staffId, new Set());
    servicesByStaff.get(l.staffId)!.add(l.serviceId);
  }
  const hoursByStaff = new Map<string, typeof hours>();
  for (const h of hours) {
    if (!hoursByStaff.has(h.staffId)) hoursByStaff.set(h.staffId, []);
    hoursByStaff.get(h.staffId)!.push(h);
  }

  return {
    services: svc,
    staff: team.map((s) => ({
      ...s,
      serviceIds: [...(servicesByStaff.get(s.id) ?? [])],
      hours: (hoursByStaff.get(s.id) ?? []).sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin),
    })),
  };
}

export type Catalog = Awaited<ReturnType<typeof getCatalog>>;
export type CatalogStaff = Catalog["staff"][number];
