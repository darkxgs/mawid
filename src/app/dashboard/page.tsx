import type { Metadata } from "next";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { TodayView } from "@/components/dashboard/today-view";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { getDaySchedule, getNeedsCheckout } from "@/server/dashboard";
import { kickSweep } from "@/server/jobs";
import { isDateStr, localDate, zonedToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage(props: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Today {...props} />
    </Suspense>
  );
}

async function Today({ searchParams }: PageProps<"/dashboard">) {
  await connection();
  const sp = await searchParams;
  const { db, business } = await requireBusiness();
  let now = new Date();
  const today = localDate(now, business.timezone);
  // Development only: ?at=HH:MM renders the day as it looks at that local time
  // (used to capture product shots with the now-line in working hours).
  if (process.env.NODE_ENV !== "production" && typeof sp.at === "string" && /^\d{2}:\d{2}$/.test(sp.at)) {
    const [h, m] = sp.at.split(":").map(Number);
    now = zonedToUtc(today, h * 60 + m, business.timezone);
  }
  const date = isDateStr(sp.date) ? sp.date : today;
  const catalog = await getCatalog(db, business);
  const [schedule, checkout] = await Promise.all([
    getDaySchedule(db, business, catalog, date, now),
    date === today ? getNeedsCheckout(db, business, now) : Promise.resolve([]),
  ]);
  after(kickSweep);
  return (
    <TodayView
      schedule={schedule}
      checkout={checkout}
      welcome={sp.welcome === "1"}
      business={{ slug: business.slug, currency: business.currency, timezone: business.timezone, name: business.name }}
      services={catalog.services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, priceMinor: s.priceMinor }))}
      team={catalog.staff.map((s) => ({ id: s.id, name: s.name, color: s.color, serviceIds: s.serviceIds }))}
    />
  );
}
