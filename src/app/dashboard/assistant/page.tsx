import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AssistantChat } from "@/components/dashboard/assistant-chat";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { localDate, weekdayOf } from "@/lib/time";

export const metadata: Metadata = { title: "Assistant" };

export default function AssistantPage() {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Assistant />
    </Suspense>
  );
}

/** "Dr. Layla Haddad" → "Dr. Layla", "Sara Nabil" → "Sara". */
const shortName = (name: string) => {
  const [first, second] = name.split(/\s+/);
  return /^dr\.?$/i.test(first) && second ? `${first} ${second}` : first;
};

async function Assistant() {
  await connection();
  const { db, business } = await requireBusiness();
  const catalog = await getCatalog(db, business);
  // Suggest someone who is actually working today, so the first answer isn't empty.
  const weekday = weekdayOf(localDate(new Date(), business.timezone));
  const onToday = catalog.staff.find((s) => s.hours.some((h) => h.weekday === weekday)) ?? catalog.staff[0];
  return <AssistantChat businessName={business.name} staffName={onToday ? shortName(onToday.name) : undefined} serviceName={catalog.services[0]?.name} />;
}
