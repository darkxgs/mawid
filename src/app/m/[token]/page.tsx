import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { canCustomerChange, getBookingByToken } from "@/server/bookings";
import { publicBusiness } from "@/server/public";
import { ManageView } from "@/components/booking/manage-view";
import { isLocale } from "@/lib/format";
import { localDate } from "@/lib/time";

export const metadata: Metadata = {
  title: "Your appointment",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ManagePage(props: PageProps<"/m/[token]">) {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 h-96 max-w-md animate-pulse rounded-[22px] bg-mist" />}>
      <Manage {...props} />
    </Suspense>
  );
}

async function Manage({ params, searchParams }: PageProps<"/m/[token]">) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const booking = await getBookingByToken(db, token);
  if (!booking || booking.status === "held") notFound();
  const business = (await getBusinessById(db, booking.businessId))!;
  const catalog = await getCatalog(db, business, { includeInactive: true });
  const now = new Date();
  return (
    <ManageView
      token={token}
      today={localDate(now, business.timezone)}
      business={publicBusiness(business, catalog)}
      initialLocale={isLocale(sp.lang) ? sp.lang : isLocale(booking.locale) ? booking.locale : "ar"}
      booking={{
        id: booking.id,
        status: booking.status,
        startsAt: booking.startsAt.toISOString(),
        serviceId: booking.serviceId,
        staffId: booking.staffId,
        canChange: canCustomerChange(booking, business, now),
        past: booking.endsAt.getTime() < now.getTime(),
      }}
    />
  );
}
