// Customer-facing message templates (WhatsApp + email share the same text).
import type { NotificationKind } from "@/db/schema";
import { formatDateLong, formatTime, type Locale } from "./format";

export type MessageData = {
  customerName: string;
  businessName: string;
  serviceName: string;
  staffName: string;
  startsAt: Date;
  timezone: string;
  manageUrl: string;
  address?: string | null;
};

export function renderMessage(kind: NotificationKind, locale: Locale, d: MessageData): string {
  const date = formatDateLong(d.startsAt, d.timezone, locale);
  const time = formatTime(d.startsAt, d.timezone, locale);
  const first = d.customerName.split(" ")[0];

  if (locale === "ar") {
    switch (kind) {
      case "confirmation":
        return [
          `أهلًا ${first}، تم تأكيد حجزك في ${d.businessName} ✅`,
          `${d.serviceName} مع ${d.staffName}`,
          `${date} الساعة ${time}`,
          d.address ? `العنوان: ${d.address}` : null,
          `لتعديل أو إلغاء الموعد: ${d.manageUrl}`,
        ]
          .filter(Boolean)
          .join("\n");
      case "reminder_24h":
        return `تذكير بموعدك في ${d.businessName}: ${d.serviceName}، ${date} الساعة ${time}.\nلو محتاج تغيّر الميعاد: ${d.manageUrl}`;
      case "reminder_2h":
        return `موعدك في ${d.businessName} النهارده الساعة ${time}. نشوفك قريب 👋`;
      case "cancellation":
        return `تم إلغاء موعدك في ${d.businessName} (${date} الساعة ${time}).\nتقدر تحجز ميعاد جديد في أي وقت.`;
      case "reschedule":
        return `تم تغيير موعدك في ${d.businessName} إلى ${date} الساعة ${time}.\n${d.manageUrl}`;
    }
  }
  switch (kind) {
    case "confirmation":
      return [
        `Hi ${first}, your booking at ${d.businessName} is confirmed ✅`,
        `${d.serviceName} with ${d.staffName}`,
        `${date} at ${time}`,
        d.address ? `Address: ${d.address}` : null,
        `Change or cancel: ${d.manageUrl}`,
      ]
        .filter(Boolean)
        .join("\n");
    case "reminder_24h":
      return `Reminder: your ${d.serviceName} at ${d.businessName} is on ${date} at ${time}.\nNeed to move it? ${d.manageUrl}`;
    case "reminder_2h":
      return `See you soon: your appointment at ${d.businessName} is today at ${time}.`;
    case "cancellation":
      return `Your appointment at ${d.businessName} on ${date} at ${time} has been cancelled. You can book a new time anytime.`;
    case "reschedule":
      return `Your appointment at ${d.businessName} has moved to ${date} at ${time}.\n${d.manageUrl}`;
  }
}

export function appUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
