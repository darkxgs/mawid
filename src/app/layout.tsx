import type { Metadata, Viewport } from "next";
// Self-hosted (no build-time call to Google Fonts). Schibsted Grotesk sets
// Latin; Arabic falls through to Noto Kufi Arabic, the modern Kufi that Gulf
// signage and government apps use. Browsers only fetch the subsets a page uses.
import "@fontsource-variable/schibsted-grotesk/index.css";
import "@fontsource-variable/noto-kufi-arabic/index.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title: { default: "Mawid | Online booking for clinics and salons", template: "%s | Mawid" },
  description:
    "Online booking, WhatsApp reminders and a live schedule for clinics, salons and service businesses. Arabic and English.",
};

export const viewport: Viewport = {
  themeColor: "#0f2e35",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
