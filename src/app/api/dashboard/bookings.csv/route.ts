import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { readSession } from "@/server/auth";
import { getBusinessById, getCatalog } from "@/server/catalog";
import { listBookings, PAGE_SIZE } from "@/server/dashboard";
import { parseBookingFilters } from "@/server/filters";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote, and defuse spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const db = await getDb();
  const business = await getBusinessById(db, session.businessId);
  if (!business || business.ownerId !== session.userId) return new Response("Sign in first.", { status: 401 });
  const catalog = await getCatalog(db, business, { includeInactive: true });
  const names = new Map(catalog.staff.map((s) => [s.id, s.name]));
  const filters = parseBookingFilters(Object.fromEntries(req.nextUrl.searchParams));

  const lines = [["Date", "Start", "End", "Customer", "Phone", "Email", "Service", "With", "Status", "Booked via", "Price", "Currency", "Notes"].map(cell).join(",")];
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: business.timezone }).format(new Date(iso));
  for (let page = 1; page <= 100; page++) {
    const { rows } = await listBookings(db, business, { ...filters, page }, new Date());
    for (const b of rows) {
      lines.push(
        [
          fmt(b.startsAt, { year: "numeric", month: "2-digit", day: "2-digit" }),
          fmt(b.startsAt, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
          fmt(b.endsAt, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
          b.customer?.name, b.customer?.phone, b.customer?.email, b.service.name, names.get(b.staffId), b.status, b.source,
          (b.priceMinor / 100).toFixed(2), business.currency, b.notes,
        ].map(cell).join(","),
      );
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${business.slug}-bookings.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
