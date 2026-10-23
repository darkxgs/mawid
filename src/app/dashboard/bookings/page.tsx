import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingsView } from "@/components/dashboard/bookings-view";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { listBookings, PAGE_SIZE } from "@/server/dashboard";
import { parseBookingFilters } from "@/server/filters";

export const metadata: Metadata = { title: "Bookings" };

export default function BookingsPage(props: PageProps<"/dashboard/bookings">) {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Bookings {...props} />
    </Suspense>
  );
}

async function Bookings({ searchParams }: PageProps<"/dashboard/bookings">) {
  await connection();
  const filters = parseBookingFilters(await searchParams);
  const { db, business } = await requireBusiness();
  const [catalog, result] = await Promise.all([
    getCatalog(db, business, { includeInactive: true }),
    listBookings(db, business, filters, new Date()),
  ]);
  return (
    <BookingsView
      rows={result.rows}
      total={result.total}
      pageSize={PAGE_SIZE}
      filters={filters}
      currency={business.currency}
      tz={business.timezone}
      team={catalog.staff.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
    />
  );
}
