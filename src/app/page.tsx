import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { Ticket } from "@/components/booking/ticket";
import { ScheduleArt, WhatsAppBubble } from "@/components/marketing/schedule-art";
import { buttonClass } from "@/components/ui";
import type { PublicBusiness } from "@/server/public";
import { demoLogin } from "./(auth)/actions";

export const metadata: Metadata = {
  title: { absolute: "Mawid | Online booking and WhatsApp reminders for clinics and salons" },
  description:
    "An Arabic-first booking page, WhatsApp reminders and one live schedule for your whole team. Built for clinics, salons and studios in the Gulf.",
};

// Static sample used only for the illustration in the hero.
const SAMPLE: PublicBusiness = {
  slug: "noor-dental",
  name: "Noor Dental Clinic",
  nameAr: "عيادة نور لطب الأسنان",
  kind: "clinic",
  tagline: null,
  taglineAr: null,
  address: null,
  addressAr: null,
  phone: null,
  timezone: "Asia/Dubai",
  currency: "AED",
  defaultLocale: "ar",
  maxAdvanceDays: 30,
  holdMinutes: 5,
  cancelWindowHours: 4,
  services: [],
  staff: [],
};

const STEPS = [
  {
    title: "Share one link",
    body: "Put your booking page in your Instagram bio, WhatsApp Business profile and Google Maps. It opens in Arabic, with English one tap away.",
  },
  {
    title: "Patients book in under a minute",
    body: "They pick a service, see real free times and confirm with a mobile number. The time is held for them while they type, so nobody else can take it.",
  },
  {
    title: "Mawid handles the rest",
    body: "A WhatsApp confirmation goes out at once, reminders the day before and on the day, and the visit lands on your team's live schedule.",
  },
];

const FEATURES = [
  ["Booking page", "Arabic-first and right-to-left, with English one tap away. Free times reflect each person's hours, breaks, time off and the gap you need between visits."],
  ["WhatsApp reminders", "Confirmations, day-before and same-day reminders, cancellations and new times, sent in the language the patient booked in. Every message is kept in an outbox."],
  ["No double bookings", "Two people can press the same time at the same second. The database itself refuses the second one, so the diary can never hold an overlap."],
  ["One live schedule", "Every chair side by side, a line for the current time, and one tap to mark a visit attended or missed. Phone and walk-in bookings go through the same checks."],
  ["Insights", "Busiest hours, no-show rate, how many people booked online and how full each person's week was."],
  ["An assistant at the desk", "Ask who's free on Thursday afternoon or move a patient to Saturday. It looks things up itself and waits for your approval before changing anything."],
] as const;

const ENGINEERING = [
  ["Overlaps are impossible, not unlikely", "A Postgres exclusion constraint on each staff member's time range rejects any overlapping booking. A test fires five holds at the same slot at once and checks exactly one wins."],
  ["Holds instead of race conditions", "Choosing a time creates a short-lived hold row. Expired holds are cleared only when someone else needs the time, so a slow patient can still confirm if nobody took it."],
  ["Reminders that send once", "Each reminder is claimed with a conditional update before it is sent, so overlapping runs never message a patient twice. A daily cron and a throttled sweep after requests keep it on time."],
  ["Time zones done properly", "Times are stored in UTC and computed in the business's own zone. Calendar days stay plain dates, so nothing drifts when a server runs elsewhere."],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="https://github.com/darkxgs/mawid" className="hidden h-9 items-center px-3 text-[14px] text-ink-2 hover:text-ink sm:inline-flex">
            Source code
          </a>
          <Link href="/login" className={buttonClass("outline", "sm")}>
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pt-16 lg:pb-28">
          <div>
            <h1 className="font-display text-[44px] leading-[1.02] font-medium tracking-[-0.025em] text-balance sm:text-[60px]">
              The front desk that never closes.
            </h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-ink-2">
              Mawid gives your clinic or salon an Arabic-first booking page, WhatsApp reminders that cut no-shows, and one live schedule for the whole team.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <form action={demoLogin}>
                <button type="submit" className={buttonClass("primary", "lg")}>
                  Open the demo clinic
                </button>
              </form>
              <Link href="/b/noor-dental" className={buttonClass("outline", "lg")}>
                Book as a patient
              </Link>
            </div>
            <p className="mt-4 text-[14px] text-muted">The demo is a working clinic with four months of bookings. No sign-up.</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 -z-0 rounded-[32px] bg-ink" />
            <div className="absolute inset-0 rounded-[32px] bg-[radial-gradient(90%_70%_at_85%_0%,#1d6b66_0%,transparent_60%)] opacity-80" />
            <div className="relative p-6 sm:p-9">
              <ScheduleArt className="max-w-[500px] max-sm:hidden" withMessage={false} />
              <div className="mt-6 grid items-end gap-5 sm:-mt-28 sm:grid-cols-[minmax(0,1fr)_280px]">
                <WhatsAppBubble className="w-full max-w-[250px] max-sm:order-2 sm:mb-10" />
                <div dir="rtl" lang="ar">
                  <Ticket
                    business={SAMPLE}
                    locale="ar"
                    status="confirmed"
                    code="7X97QH"
                    service={{ id: "s", name: "Check-up & cleaning", nameAr: "فحص وتنظيف", description: null, descriptionAr: null, durationMin: 45, priceMinor: 25000 }}
                    staff={{ id: "a", name: "Sara Nabil", nameAr: "سارة نبيل", title: null, titleAr: null, color: "#6B4E8C", serviceIds: [] }}
                    start="2026-10-29T12:30:00.000Z"
                    className="drop-shadow-[0_30px_40px_rgb(0_0_0/0.45)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="how" className="border-y border-mist bg-card">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="how" className="font-display max-w-xl text-[32px] leading-tight font-medium tracking-[-0.02em]">
              From a link in your bio to a full diary.
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative">
                  <span className="font-display tnum text-[15px] font-medium text-sea">{i + 1}</span>
                  <h3 className="mt-3 text-[19px] leading-snug font-medium">{s.title}</h3>
                  <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="inside" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <h2 id="inside" className="font-display text-[32px] leading-tight font-medium tracking-[-0.02em] lg:sticky lg:top-10 lg:self-start">
              Built for how people in the Gulf actually book.
            </h2>
            <dl className="divide-y divide-mist border-y border-mist">
              {FEATURES.map(([title, body]) => (
                <div key={title} className="grid gap-2 py-6 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-8">
                  <dt className="text-[16px] font-medium">{title}</dt>
                  <dd className="text-[15.5px] leading-relaxed text-ink-2">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="hood" className="bg-ink text-white">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 id="hood" className="font-display max-w-xl text-[32px] leading-tight font-medium tracking-[-0.02em]">
                Under the hood
              </h2>
              <a href="https://github.com/darkxgs/mawid" className={buttonClass("saffron", "md")}>
                Read the source
              </a>
            </div>
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-white/70">
              Next.js 16, React 19, Postgres with Drizzle, the AI SDK for the assistant. Bookings are correct because the database enforces it, and the tests prove it against a real Postgres engine.
            </p>
            <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {ENGINEERING.map(([title, body]) => (
                <div key={title} className="border-t border-white/15 pt-5">
                  <dt className="text-[17px] font-medium">{title}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-white/70">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-10 text-[14px] text-muted sm:px-8">
        <Logo />
        <p>
          Designed and built by{" "}
          <a href="https://seifashraf.dev" className="font-medium text-ink underline-offset-4 hover:underline">
            Seif Ashraf
          </a>
        </p>
      </footer>
    </div>
  );
}
