import type { Metadata } from "next";
import { and, gte, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { TeamView } from "@/components/dashboard/team-view";
import { timeOff } from "@/db/schema";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { localDate } from "@/lib/time";

export const metadata: Metadata = { title: "Team & hours" };

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="m-8 h-[60vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Team />
    </Suspense>
  );
}

async function Team() {
  await connection();
  const { db, business } = await requireBusiness();
  const catalog = await getCatalog(db, business, { includeInactive: true });
  const ids = catalog.staff.map((s) => s.id);
  const off = ids.length
    ? await db.select().from(timeOff).where(and(inArray(timeOff.staffId, ids), gte(timeOff.endsAt, new Date())))
    : [];
  const tz = business.timezone;
  return (
    <TeamView
      weekStart={business.currency === "AED" ? 1 : 0}
      services={catalog.services.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
      team={catalog.staff.map((s) => ({
        id: s.id,
        name: s.name,
        nameAr: s.nameAr,
        title: s.title,
        titleAr: s.titleAr,
        color: s.color,
        active: s.active,
        serviceIds: s.serviceIds,
        hours: s.hours.map((h) => ({ weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
        timeOff: off
          .filter((o) => o.staffId === s.id)
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
          .map((o) => ({
            id: o.id,
            from: localDate(o.startsAt, tz),
            to: localDate(new Date(o.endsAt.getTime() - 1), tz),
            reason: o.reason,
          })),
      }))}
    />
  );
}
