import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Readex_Pro } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({
  variable: "--font-plex",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title: { default: "Mawid — Appointments that book themselves", template: "%s · Mawid" },
  description:
    "Online booking, WhatsApp reminders and a live schedule for clinics, salons and service businesses. Arabic and English.",
};

export const viewport: Viewport = {
  themeColor: "#0f2e35",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${readex.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
