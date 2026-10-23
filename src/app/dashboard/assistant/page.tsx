import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AssistantChat } from "@/components/dashboard/assistant-chat";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";

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
  return <AssistantChat businessName={business.name} staffName={catalog.staff[1] ? shortName(catalog.staff[1].name) : catalog.staff[0] ? shortName(catalog.staff[0].name) : undefined} serviceName={catalog.services[0]?.name} />;
}
