// Demo data for "Noor Dental Clinic". Idempotent: the static parts are created
// once, and bookings are topped up for any day in the rolling window that has
// none, so the public demo always has a busy past and a realistic future.
import bcrypt from "bcryptjs";
import type { MigrationTarget } from "./migrate";
import { rawQuery } from "./raw";
import { newId, newToken } from "@/lib/id";
import { addDays, addMinutes, localDate, weekdayOf, zonedToUtc, type DateStr } from "@/lib/time";
import { renderMessage, appUrl } from "@/lib/messages";
import type { Locale } from "@/lib/format";

export const DEMO = {
  userId: "usr_demo",
  email: "demo@mawid.app",
  password: "demo1234",
  businessId: "biz_demo",
  slug: "noor-dental",
  tz: "Asia/Dubai",
};

type StaffSeed = {
  id: string;
  name: string;
  nameAr: string;
  title: string;
  titleAr: string;
  color: string;
  hours: Record<number, [number, number][]>; // weekday -> [startMin, endMin][]
  services: string[];
};

type ServiceSeed = {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  duration: number;
  bufferAfter: number;
  price: number; // AED
};

const h = (hh: number, mm = 0) => hh * 60 + mm;

const SERVICES: ServiceSeed[] = [
  { id: "svc_checkup", name: "Check-up & cleaning", nameAr: "فحص وتنظيف", description: "Full exam, scaling and polish.", descriptionAr: "فحص كامل وإزالة الجير وتلميع.", duration: 45, bufferAfter: 10, price: 250 },
  { id: "svc_whitening", name: "Teeth whitening", nameAr: "تبييض الأسنان", description: "In-clinic whitening, up to 8 shades.", descriptionAr: "تبييض في العيادة حتى 8 درجات.", duration: 60, bufferAfter: 15, price: 950 },
  { id: "svc_filling", name: "Tooth-coloured filling", nameAr: "حشوة تجميلية", description: "Composite filling matched to your tooth.", descriptionAr: "حشوة بلون السن الطبيعي.", duration: 40, bufferAfter: 10, price: 380 },
  { id: "svc_ortho", name: "Braces consultation", nameAr: "استشارة تقويم", description: "Scan, photos and a treatment plan.", descriptionAr: "مسح وصور وخطة علاج.", duration: 30, bufferAfter: 0, price: 150 },
  { id: "svc_aligner", name: "Aligner check-in", nameAr: "متابعة التقويم الشفاف", description: "Progress check and next set of aligners.", descriptionAr: "متابعة التقدم واستلام المرحلة التالية.", duration: 20, bufferAfter: 5, price: 120 },
  { id: "svc_toothache", name: "Toothache visit", nameAr: "زيارة ألم الأسنان", description: "Same-day exam and pain relief.", descriptionAr: "فحص في نفس اليوم وتخفيف الألم.", duration: 30, bufferAfter: 10, price: 300 },
  { id: "svc_kids", name: "Children's check-up", nameAr: "فحص الأطفال", description: "Gentle exam for ages 3 to 12.", descriptionAr: "فحص لطيف للأطفال من 3 إلى 12 سنة.", duration: 30, bufferAfter: 10, price: 200 },
];

const STAFF: StaffSeed[] = [
  {
    id: "stf_omar", name: "Dr. Omar Al Mansouri", nameAr: "د. عمر المنصوري", title: "General dentist", titleAr: "طبيب أسنان عام", color: "#1D6B66",
    hours: Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, [[h(9), h(13)], [h(14), h(19)]]])),
    services: ["svc_checkup", "svc_filling", "svc_toothache", "svc_kids"],
  },
  {
    id: "stf_layla", name: "Dr. Layla Haddad", nameAr: "د. ليلى حداد", title: "Orthodontist", titleAr: "أخصائية تقويم", color: "#A86A1C",
    hours: { 1: [[h(10), h(14)], [h(16), h(20)]], 2: [[h(10), h(14)], [h(16), h(20)]], 3: [[h(10), h(14)], [h(16), h(20)]], 4: [[h(10), h(14)], [h(16), h(20)]], 6: [[h(10), h(15)]] },
    services: ["svc_ortho", "svc_aligner"],
  },
  {
    id: "stf_sara", name: "Sara Nabil", nameAr: "سارة نبيل", title: "Dental hygienist", titleAr: "أخصائية صحة الفم", color: "#6B4E8C",
    hours: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [[h(9), h(13)], [h(14), h(17)]]])),
    services: ["svc_checkup", "svc_whitening", "svc_kids"],
  },
  {
    id: "stf_karim", name: "Dr. Karim Youssef", nameAr: "د. كريم يوسف", title: "Cosmetic dentist", titleAr: "طبيب تجميل أسنان", color: "#3C6E9F",
    hours: Object.fromEntries([2, 3, 4, 5, 6].map((d) => [d, [[h(12), h(16)], [h(17), h(21)]]])),
    services: ["svc_whitening", "svc_filling", "svc_checkup", "svc_toothache"],
  },
];

const CUSTOMERS: { name: string; locale: Locale }[] = [
  { name: "Mariam Al Hashimi", locale: "ar" }, { name: "Ahmed Khalil", locale: "ar" }, { name: "Fatima Al Zaabi", locale: "ar" },
  { name: "Youssef Hamdan", locale: "ar" }, { name: "Noura Saleh", locale: "ar" }, { name: "Khalid Al Suwaidi", locale: "ar" },
  { name: "Hessa Al Marri", locale: "ar" }, { name: "Omar Farouk", locale: "ar" }, { name: "Reem Haddad", locale: "ar" },
  { name: "Salem Al Ketbi", locale: "ar" }, { name: "Laila Mansour", locale: "ar" }, { name: "Hamad Al Nuaimi", locale: "ar" },
  { name: "Aisha Rahman", locale: "ar" }, { name: "Majid Al Falasi", locale: "ar" }, { name: "Dana Qasim", locale: "ar" },
  { name: "Tariq Aziz", locale: "ar" }, { name: "Shamma Al Kaabi", locale: "ar" }, { name: "Rashid Obaid", locale: "ar" },
  { name: "Sophie Turner", locale: "en" }, { name: "James Whitaker", locale: "en" }, { name: "Priya Nair", locale: "en" },
  { name: "Daniel Okafor", locale: "en" }, { name: "Elena Petrova", locale: "en" }, { name: "Arjun Mehta", locale: "en" },
  { name: "Hannah Becker", locale: "en" }, { name: "Lucas Moreau", locale: "en" }, { name: "Grace Liu", locale: "en" },
  { name: "Mohammed Iqbal", locale: "en" }, { name: "Chloe Martin", locale: "en" }, { name: "Ravi Shankar", locale: "en" },
  { name: "Nadia Benali", locale: "ar" }, { name: "Karim Mostafa", locale: "ar" }, { name: "Yasmin Adel", locale: "ar" },
  { name: "Sultan Al Shamsi", locale: "ar" }, { name: "Amira Fathy", locale: "ar" }, { name: "Ben Carter", locale: "en" },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s: string) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

async function one<T>(t: MigrationTarget, sql: string, p: unknown[] = []) {
  return (await rawQuery<T>(t, sql, p))[0];
}

export async function seedDemo(t: MigrationTarget, now = new Date()) {
  const exists = await one<{ id: string }>(t, `SELECT id FROM businesses WHERE id = $1`, [DEMO.businessId]);
  if (!exists) await seedStatic(t);
  await topUpDemoBookings(t, now);
}

async function seedStatic(t: MigrationTarget) {
  const hash = await bcrypt.hash(DEMO.password, 10);
  await rawQuery(t, `INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [
    DEMO.userId, DEMO.email, "Demo Owner", hash,
  ]);
  await rawQuery(
    t,
    `INSERT INTO businesses (id, owner_id, slug, name, name_ar, kind, tagline, tagline_ar, address, address_ar, phone, timezone, currency, default_locale, slot_interval_min, min_notice_min, max_advance_days)
     VALUES ($1,$2,$3,$4,$5,'clinic',$6,$7,$8,$9,$10,$11,'AED','ar',15,60,30)`,
    [
      DEMO.businessId, DEMO.userId, DEMO.slug, "Noor Dental Clinic", "عيادة نور لطب الأسنان",
      "Family dentistry in Jumeirah", "طب أسنان للعائلة في جميرا",
      "Al Wasl Road, Jumeirah 1, Dubai", "شارع الوصل، جميرا 1، دبي", "+971 4 000 0000", DEMO.tz,
    ],
  );
  for (const [i, s] of SERVICES.entries()) {
    await rawQuery(
      t,
      `INSERT INTO services (id, business_id, name, name_ar, description, description_ar, duration_min, buffer_after_min, price_minor, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s.id, DEMO.businessId, s.name, s.nameAr, s.description, s.descriptionAr, s.duration, s.bufferAfter, s.price * 100, i],
    );
  }
  for (const [i, s] of STAFF.entries()) {
    await rawQuery(
      t,
      `INSERT INTO staff (id, business_id, name, name_ar, title, title_ar, color, position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [s.id, DEMO.businessId, s.name, s.nameAr, s.title, s.titleAr, s.color, i],
    );
    for (const svc of s.services) {
      await rawQuery(t, `INSERT INTO staff_services (staff_id, service_id) VALUES ($1,$2)`, [s.id, svc]);
    }
    for (const [wd, ranges] of Object.entries(s.hours)) {
      for (const [a, b] of ranges) {
        await rawQuery(
          t,
          `INSERT INTO working_hours (id, staff_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4,$5)`,
          [newId("wh"), s.id, Number(wd), a, b],
        );
      }
    }
  }
  for (const [i, c] of CUSTOMERS.entries()) {
    await rawQuery(t, `INSERT INTO customers (id, business_id, name, phone) VALUES ($1,$2,$3,$4)`, [
      `cus_demo_${i}`, DEMO.businessId, c.name, `+97150000${String(1000 + i).slice(-4)}`,
    ]);
  }
}

/** Fill every empty day from 28 days ago to 12 days ahead with bookings. */
export async function topUpDemoBookings(t: MigrationTarget, now = new Date()) {
  const today = localDate(now, DEMO.tz);
  const from = addDays(today, -28);
  const to = addDays(today, 12);
  const rows = await rawQuery<{ d: string }>(
    t,
    `SELECT DISTINCT to_char(starts_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d FROM bookings
     WHERE business_id = $1 AND starts_at >= $3 AND starts_at < $4`,
    [DEMO.businessId, DEMO.tz, zonedToUtc(from, 0, DEMO.tz).toISOString(), zonedToUtc(addDays(to, 1), 0, DEMO.tz).toISOString()],
  );
  const filled = new Set(rows.map((r) => r.d));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!filled.has(d)) await seedDay(t, d, today, now);
  }
}

async function seedDay(t: MigrationTarget, date: DateStr, today: DateStr, now: Date) {
  const wd = weekdayOf(date);
  const dayOffset = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  const base = APP_URL_SAFE();
  for (const s of STAFF) {
    const ranges = s.hours[wd];
    if (!ranges) continue;
    const rnd = mulberry32(hashStr(date + s.id));
    const fill = dayOffset <= 0 ? 0.78 : Math.max(0.18, 0.72 - dayOffset * 0.05);
    for (const [a, b] of ranges) {
      let cursor = a;
      while (cursor + 20 <= b) {
        if (rnd() > fill) {
          cursor += 15 * (1 + Math.floor(rnd() * 3));
          continue;
        }
        const options = SERVICES.filter((x) => s.services.includes(x.id) && cursor + x.duration <= b);
        if (!options.length) break;
        const svc = options[Math.floor(rnd() * options.length)];
        const startsAt = zonedToUtc(date, cursor, DEMO.tz);
        const endsAt = addMinutes(startsAt, svc.duration);
        const occupiedTo = addMinutes(endsAt, svc.bufferAfter);
        const custIdx = Math.floor(rnd() * CUSTOMERS.length);
        const cust = CUSTOMERS[custIdx];
        const r = rnd();
        let status: string;
        if (endsAt < now) status = r < 0.05 ? "no_show" : r < 0.12 ? "cancelled" : "completed";
        else status = r < 0.06 ? "cancelled" : "confirmed";
        const src = rnd();
        const source = src < 0.68 ? "web" : src < 0.88 ? "dashboard" : "assistant";
        const id = newId("bk");
        const token = newToken();
        const createdAt = addMinutes(startsAt, -60 * 24 * (1 + Math.floor(rnd() * 6)) - Math.floor(rnd() * 600));
        await rawQuery(
          t,
          `INSERT INTO bookings (id, business_id, service_id, staff_id, customer_id, starts_at, ends_at, occupied_from, occupied_to, status, source, price_minor, manage_token, locale, created_at, cancelled_at, reminder_24_sent_at, reminder_2_sent_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            id, DEMO.businessId, svc.id, s.id, `cus_demo_${custIdx}`,
            startsAt.toISOString(), endsAt.toISOString(), occupiedTo.toISOString(), status, source, svc.price * 100, token, cust.locale,
            createdAt.toISOString(),
            status === "cancelled" ? addMinutes(startsAt, -60 * 20).toISOString() : null,
            endsAt < now && status !== "cancelled" ? addMinutes(startsAt, -60 * 24).toISOString() : null,
            endsAt < now && status !== "cancelled" ? addMinutes(startsAt, -120).toISOString() : null,
          ],
        );
        // A realistic message trail for the "Messages" screen.
        if (Math.abs(dayOffset) <= 3) {
          const data = {
            customerName: cust.name,
            businessName: cust.locale === "ar" ? "عيادة نور لطب الأسنان" : "Noor Dental Clinic",
            serviceName: cust.locale === "ar" ? svc.nameAr : svc.name,
            staffName: cust.locale === "ar" ? s.nameAr : s.name,
            startsAt,
            timezone: DEMO.tz,
            manageUrl: `${base}/m/${token}`,
          };
          const phone = `+97150000${String(1000 + custIdx).slice(-4)}`;
          const msgs: [string, Date][] = [["confirmation", createdAt]];
          if (endsAt < now && status !== "cancelled") msgs.push(["reminder_24h", addMinutes(startsAt, -60 * 24)]);
          if (status === "cancelled") msgs.push(["cancellation", addMinutes(startsAt, -60 * 20)]);
          for (const [kind, at] of msgs) {
            await rawQuery(
              t,
              `INSERT INTO notifications (id, business_id, booking_id, channel, kind, recipient, body, status, created_at)
               VALUES ($1,$2,$3,'whatsapp',$4,$5,$6,'simulated',$7)`,
              [newId("ntf"), DEMO.businessId, id, kind, phone, renderMessage(kind as never, cust.locale, data), at.toISOString()],
            );
          }
        }
        cursor += svc.duration + svc.bufferAfter;
        cursor = Math.ceil(cursor / 15) * 15;
      }
    }
  }
}

function APP_URL_SAFE() {
  try {
    return appUrl();
  } catch {
    return "http://localhost:3000";
  }
}
