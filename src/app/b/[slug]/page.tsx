import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db";
import { getBusinessBySlug, getCatalog } from "@/server/catalog";
import { publicBusiness } from "@/server/public";
import { BookingFlow } from "@/components/booking/booking-flow";
import { isLocale, pick } from "@/lib/format";
import { localDate } from "@/lib/time";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  // Business details change from the dashboard, so read them per request.
  await connection();
  const { slug } = await params;
  const business = await getBusinessBySlug(await getDb(), slug);
  if (!business) return { title: "Not found" };
  const name = pick(business.defaultLocale === "en" ? "en" : "ar", business.name, business.nameAr);
  return {
    title: name,
    description: [business.tagline, business.address].filter(Boolean).join(". "),
    openGraph: { title: name, description: business.taglineAr ?? business.tagline ?? undefined },
  };
}

export default function BookingPage(props: PageProps<"/b/[slug]">) {
  return (
    <Suspense fallback={<BookingSkeleton />}>
      <Booking {...props} />
    </Suspense>
  );
}

async function Booking({ params, searchParams }: PageProps<"/b/[slug]">) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const business = await getBusinessBySlug(db, slug);
  if (!business) notFound();
  const catalog = await getCatalog(db, business);
  const pub = publicBusiness(business, catalog);
  const lang = isLocale(sp.lang) ? sp.lang : pub.defaultLocale;
  const service = typeof sp.service === "string" ? sp.service : undefined;
  return <BookingFlow business={pub} today={localDate(new Date(), business.timezone)} initialLocale={lang} initialServiceId={service} />;
}

function BookingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6" aria-busy>
      <div className="flex items-center gap-4">
        <div className="size-12 animate-pulse rounded-[14px] bg-mist" />
        <div className="grid gap-2">
          <div className="h-4 w-48 animate-pulse rounded bg-mist" />
          <div className="h-3 w-32 animate-pulse rounded bg-mist-2" />
        </div>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="h-96 animate-pulse rounded-panel bg-mist-2" />
        <div className="hidden h-80 animate-pulse rounded-[22px] bg-mist lg:block" />
      </div>
    </div>
  );
}
