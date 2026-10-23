import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServicesView } from "@/components/dashboard/services-view";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="m-8 h-[60vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Services />
    </Suspense>
  );
}

async function Services() {
  await connection();
  const { db, business } = await requireBusiness();
  const catalog = await getCatalog(db, business, { includeInactive: true });
  return (
    <ServicesView
      currency={business.currency}
      slug={business.slug}
      services={catalog.services.map((s) => ({
        id: s.id,
        name: s.name,
        nameAr: s.nameAr,
        description: s.description,
        descriptionAr: s.descriptionAr,
        durationMin: s.durationMin,
        bufferAfterMin: s.bufferAfterMin,
        priceMinor: s.priceMinor,
        active: s.active,
        staffIds: catalog.staff.filter((m) => m.serviceIds.includes(s.id)).map((m) => m.id),
      }))}
      team={catalog.staff.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, color: m.color }))}
    />
  );
}
