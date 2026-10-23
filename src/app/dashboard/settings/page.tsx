import type { Metadata } from "next";
import { connection } from "next/server";
import QRCode from "qrcode";
import { Suspense } from "react";
import { SettingsView } from "@/components/dashboard/settings-view";
import { requireBusiness } from "@/server/auth";
import { appUrl } from "@/lib/messages";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="m-8 h-[60vh] animate-pulse rounded-panel bg-mist-2" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await connection();
  const { business } = await requireBusiness();
  const base = appUrl();
  const url = `${base}/b/${business.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#0f2e35", light: "#0000" }, errorCorrectionLevel: "M" });
  return (
    <SettingsView
      base={base}
      qr={qr}
      business={{
        name: business.name,
        nameAr: business.nameAr,
        tagline: business.tagline,
        taglineAr: business.taglineAr,
        address: business.address,
        addressAr: business.addressAr,
        phone: business.phone,
        slug: business.slug,
        defaultLocale: business.defaultLocale,
        slotIntervalMin: business.slotIntervalMin,
        minNoticeMin: business.minNoticeMin,
        maxAdvanceDays: business.maxAdvanceDays,
        holdMinutes: business.holdMinutes,
        cancelWindowHours: business.cancelWindowHours,
        whatsappEnabled: business.whatsappEnabled,
        timezone: business.timezone,
        currency: business.currency,
      }}
    />
  );
}
