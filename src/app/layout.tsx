import type { Metadata, Viewport } from "next";
// Self-hosted (no build-time call to Google Fonts). Only the Arabic and Latin
// subsets ship; browsers download a file only when its unicode-range is used.
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-500.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "@fontsource-variable/readex-pro/index.css";
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
