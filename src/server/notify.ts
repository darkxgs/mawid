import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { bookings, businesses, customers, notifications, services, staff, type NotificationKind } from "@/db/schema";
import { newId } from "@/lib/id";
import { appUrl, renderMessage } from "@/lib/messages";
import { isLocale, pick, type Locale } from "@/lib/format";

/**
 * Delivery providers. Both are optional: without credentials the message is
 * written to the outbox as "simulated", which is what the public demo shows.
 *
 * WhatsApp uses the Cloud API. Business-initiated messages outside the 24-hour
 * service window need an approved template, so production setups should point
 * WHATSAPP_TEMPLATE at one with a single body parameter.
 */
async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; error?: string } | null> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;
  const template = process.env.WHATSAPP_TEMPLATE;
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: to.replace("+", ""),
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: body }] }],
        },
      }
    : { messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}` };
}

async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string } | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Mawid <bookings@mawid.app>",
      to,
      subject,
      text: body,
    }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
}

const SUBJECTS: Record<NotificationKind, Record<Locale, string>> = {
  confirmation: { en: "Your booking is confirmed", ar: "تم تأكيد حجزك" },
  reminder_24h: { en: "Appointment reminder", ar: "تذكير بموعدك" },
  reminder_2h: { en: "See you today", ar: "نشوفك النهارده" },
  cancellation: { en: "Your appointment was cancelled", ar: "تم إلغاء موعدك" },
  reschedule: { en: "Your appointment has moved", ar: "تم تغيير موعدك" },
};

export async function notifyBooking(db: DB, bookingId: string, kind: NotificationKind) {
  const [row] = await db
    .select({ booking: bookings, business: businesses, service: services, staff: staff, customer: customers })
    .from(bookings)
    .innerJoin(businesses, eq(businesses.id, bookings.businessId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .leftJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row?.customer) return;

  const l: Locale = isLocale(row.booking.locale) ? row.booking.locale : "ar";
  const body = renderMessage(kind, l, {
    customerName: row.customer.name,
    businessName: pick(l, row.business.name, row.business.nameAr),
    serviceName: pick(l, row.service.name, row.service.nameAr),
    staffName: pick(l, row.staff.name, row.staff.nameAr),
    startsAt: row.booking.startsAt,
    timezone: row.business.timezone,
    manageUrl: `${appUrl()}/m/${row.booking.manageToken}`,
    address: pick(l, row.business.address ?? "", row.business.addressAr) || null,
  });

  const jobs: Promise<void>[] = [];
  if (row.business.whatsappEnabled) {
    jobs.push(
      (async () => {
        const r = await sendWhatsApp(row.customer!.phone, body).catch((e) => ({ ok: false, error: String(e) }));
        await db.insert(notifications).values({
          id: newId("ntf"),
          businessId: row.business.id,
          bookingId,
          channel: "whatsapp",
          kind,
          recipient: row.customer!.phone,
          body,
          status: r === null ? "simulated" : r.ok ? "sent" : "failed",
          error: r && !r.ok ? r.error : null,
        });
      })(),
    );
  }
  if (row.customer.email) {
    jobs.push(
      (async () => {
        const r = await sendEmail(row.customer!.email!, SUBJECTS[kind][l], body).catch((e) => ({ ok: false, error: String(e) }));
        await db.insert(notifications).values({
          id: newId("ntf"),
          businessId: row.business.id,
          bookingId,
          channel: "email",
          kind,
          recipient: row.customer!.email!,
          body,
          status: r === null ? "simulated" : r.ok ? "sent" : "failed",
          error: r && !r.ok ? r.error : null,
        });
      })(),
    );
  }
  await Promise.allSettled(jobs);
}
