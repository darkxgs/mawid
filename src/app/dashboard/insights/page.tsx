import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { InsightsView } from "@/components/dashboard/insights-view";
import { requireBusiness } from "@/server/auth";
import { getCatalog } from "@/server/catalog";
import { getInsights } from "@/server/dashboard";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage(props: PageProps<"/dashboard/insights">) {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-panel bg-mist-2" />}>
      <InsightsLoader {...props} />
    </Suspense>
  );
}

async function InsightsLoader({ searchParams }: PageProps<"/dashboard/insights">) {
  await connection();
  const sp = await searchParams;
  const days = [7, 28, 90].includes(Number(sp.days)) ? Number(sp.days) : 28;
  const { db, business } = await requireBusiness();
  const catalog = await getCatalog(db, business, { includeInactive: true });
  const data = await getInsights(business, catalog, new Date(), days);
  return <InsightsView data={data} currency={business.currency} weekStart={business.currency === "AED" ? 1 : 0} />;
}
