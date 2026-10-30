import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { BookingPreview } from "@/components/marketing/booking-preview";
import { Photo } from "@/components/marketing/photo";
import { WhatsAppBubble } from "@/components/marketing/schedule-art";
import { buttonClass } from "@/components/ui";
import { HERO_FILM, PHOTOS } from "@/lib/media";
import { renderMessage } from "@/lib/messages";
import { demoLogin } from "./(auth)/actions";

/** The product screenshot spans the 7xl container less its padding. */
const SCREEN_SIZES = "(min-width: 1280px) 1200px, (min-width: 640px) calc(100vw - 80px), calc(100vw - 40px)";

export const metadata: Metadata = {
  title: { absolute: "Mawid | Online booking and WhatsApp reminders for clinics and salons" },
  description:
    "An Arabic-first booking page, WhatsApp reminders and one live schedule for your whole team. Built for clinics, salons and studios in the Gulf.",
};

const SAMPLE = {
  customerName: "Mariam Al Hashimi",
  businessName: "عيادة نور لطب الأسنان",
  serviceName: "فحص وتنظيف",
  staffName: "سارة نبيل",
  startsAt: new Date("2026-10-29T12:30:00.000Z"),
  timezone: "Asia/Dubai",
  manageUrl: "mawid-bay.vercel.app/m/7x97qh",
};

const ENGINEERING = [
  ["Overlaps are impossible, not unlikely", "A Postgres exclusion constraint on each staff member's time range rejects any overlapping booking. A test fires five holds at the same slot at once and checks that exactly one wins."],
  ["Holds instead of race conditions", "Choosing a time creates a short-lived hold. Expired holds are cleared only when someone else needs the time, so a slow patient can still confirm if nobody took it."],
  ["Reminders that send once", "Each reminder is claimed with a conditional update before it is sent, so overlapping runs never message a patient twice."],
  ["Time zones done properly", "Times are stored in UTC and computed in the business's own zone. Calendar days stay plain dates, so nothing drifts on a server elsewhere."],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh bg-white text-ink">
      {/* ------------------------------------------------------------ hero */}
      <section className="relative isolate flex min-h-[620px] flex-col overflow-hidden bg-ink text-white sm:h-[min(94svh,900px)]">
        {HERO_FILM ? (
          <video
            className="absolute inset-0 -z-20 size-full object-cover object-[72%_center] lg:object-center"
            poster={PHOTOS.frontDesk.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden
          >
            <source src={HERO_FILM.webm} type="video/webm" />
            <source src={HERO_FILM.src} type="video/mp4" />
          </video>
        ) : (
          <Image src={PHOTOS.frontDesk.src} alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[72%_center] lg:object-center" />
        )}
        {/* legibility scrim: darker where the type sits */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgb(11_33_38/0.92)_0%,rgb(11_33_38/0.55)_38%,rgb(11_33_38/0.15)_70%,rgb(11_33_38/0.35)_100%)]" />

        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-10">
          <Logo tone="white" />
          <nav className="flex items-center gap-1">
            <a href="https://github.com/darkxgs/mawid" className="hidden h-9 items-center px-3 text-[14px] text-white/80 hover:text-white sm:inline-flex">
              Source
            </a>
            <Link href="/login" className="inline-flex h-9 items-center rounded-full bg-white/12 px-4 text-[14px] font-medium backdrop-blur-sm hover:bg-white/20">
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mx-auto mt-auto grid grid-cols-1 w-full max-w-7xl items-end gap-10 px-5 pb-12 sm:px-10 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-2xl">
            <h1 className="font-display text-[46px] leading-[0.98] font-semibold tracking-[-0.035em] text-balance sm:text-[76px]">
              The front desk that never closes.
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-white/80">
              An Arabic-first booking page, WhatsApp reminders and one live schedule for your clinic or salon.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <form action={demoLogin}>
                <button type="submit" className={buttonClass("saffron", "lg", "px-6")}>
                  Open the demo clinic
                </button>
              </form>
              <Link href="/b/noor-dental" className="inline-flex h-12 items-center rounded-[12px] px-6 text-[15px] font-medium text-white ring-1 ring-white/40 ring-inset hover:bg-white/10">
                Book as a patient
              </Link>
            </div>
          </div>
          <p dir="rtl" lang="ar" aria-hidden className="font-kufi hidden text-[150px] leading-[0.8] font-extrabold text-white/90 lg:block xl:text-[190px]">
            موعد
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------- the old way */}
      <section className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-12 px-5 py-24 sm:px-10 lg:grid-cols-2 lg:gap-20 lg:py-32">
        <Photo photo={PHOTOS.paperCard} sizes="(min-width: 1024px) 50vw, 100vw" className="aspect-[3/2] rounded-[6px]" />
        <div>
          <h2 className="font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
            Most clinics still book on paper and phone calls.
          </h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2">
            Every visit is a call, a line in the book, and a reminder somebody has to remember to send. Mawid moves all three onto one link your patients already know how to use.
          </p>
          <ol className="mt-10 grid grid-cols-1 gap-6 border-t border-ink/12 pt-8 sm:grid-cols-3">
            {[
              ["Share one link", "In your Instagram bio, WhatsApp profile and Google Maps."],
              ["They book in a minute", "Real free times, in Arabic or English, held while they type."],
              ["Mawid does the rest", "Confirmation and reminders on WhatsApp, straight onto your schedule."],
            ].map(([t, b], i) => (
              <li key={t}>
                <span className="font-display tnum text-[13px] font-semibold text-sea">0{i + 1}</span>
                <p className="mt-1.5 text-[16px] font-semibold">{t}</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------- booking page */}
      <section className="bg-saffron">
        <div className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-14 px-5 py-24 sm:px-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:py-28">
          <div>
            <h2 className="font-display max-w-xl text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
              A booking page patients finish, not abandon.
            </h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink/80">
              It opens in Arabic, right to left, with English one tap away. Every time shown is genuinely free: hours, breaks, time off and cleaning gaps are already taken into account. Try the one on the right.
            </p>
            <dl className="mt-10 grid grid-cols-1 max-w-xl gap-x-10 gap-y-6 sm:grid-cols-2">
              {[
                ["Held while they type", "The time is reserved for five minutes so nobody else takes it mid-booking."],
                ["Change it themselves", "Every confirmation has a link to move or cancel, inside your policy."],
                ["One link per service", "Send whitening patients straight to whitening."],
                ["Calendar ready", "Add to Apple or Google Calendar in one tap."],
              ].map(([t, b]) => (
                <div key={t} className="border-t border-ink/20 pt-4">
                  <dt className="text-[15.5px] font-semibold">{t}</dt>
                  <dd className="mt-1 text-[14.5px] leading-relaxed text-ink/75">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
          <BookingPreview className="justify-self-center lg:justify-self-end" />
        </div>
      </section>

      {/* ---------------------------------------------------- reminders */}
      <section className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-12 px-5 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:py-32">
        <div className="relative">
          <Photo photo={PHOTOS.reminder} sizes="(min-width: 1024px) 42vw, 100vw" className="aspect-[4/5] rounded-[6px]" />
          <WhatsAppBubble className="absolute -bottom-8 start-6 w-[min(300px,80%)] shadow-[0_18px_40px_-18px_rgb(0_0_0/0.5)] sm:start-auto sm:-end-10" time="9:02">
            {renderMessage("reminder_24h", "ar", SAMPLE)}
          </WhatsAppBubble>
        </div>
        <div className="max-sm:mt-10">
          <h2 className="font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
            Reminders go out on their own, in their language.
          </h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2">
            A confirmation the moment someone books. A reminder the day before and another on the day. If they move or cancel, they hear about it too. Arabic for patients who booked in Arabic, English for the rest.
          </p>
          <div className="mt-10 grid max-w-md gap-3">
            <WhatsAppBubble dir="ltr" time="Tue 18:40">
              {renderMessage("confirmation", "en", { ...SAMPLE, customerName: "James Whitaker", businessName: "Noor Dental Clinic", serviceName: "Teeth whitening", staffName: "Dr. Karim Youssef" })}
            </WhatsAppBubble>
          </div>
          <p className="mt-6 text-[14px] text-muted">Every message is kept in the outbox, so the front desk can see exactly what a patient was sent.</p>
        </div>
      </section>

      {/* ----------------------------------------------------- schedule */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-7xl px-5 pt-24 sm:px-10 lg:pt-28">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <h2 className="font-display text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[44px]">
              Every chair on one live schedule.
            </h2>
            <p className="max-w-lg text-[17px] leading-relaxed text-white/70 lg:justify-self-end">
              Online, phone and walk-in bookings land in the same place, with a line for the current time. One tap marks a visit attended or missed, and the numbers add themselves up.
            </p>
          </div>
          <div className="mt-14 overflow-hidden rounded-t-[10px] ring-1 ring-white/10">
            {/* Pre-encoded so the UI text stays sharp: AVIF is about a fifth of the PNG's weight. */}
            <picture>
              <source type="image/avif" srcSet="/product/dashboard-today-1440.avif 1440w, /product/dashboard-today.avif 2880w" sizes={SCREEN_SIZES} />
              <source type="image/webp" srcSet="/product/dashboard-today-1440.webp 1440w, /product/dashboard-today.webp 2880w" sizes={SCREEN_SIZES} />
              <img
                src="/product/dashboard-today.png"
                alt="The Today screen: a timeline of appointments for three team members, with day totals above."
                width={2880}
                height={1800}
                loading="lazy"
                decoding="async"
                className="h-auto w-full"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- who it's for */}
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-10 lg:py-32">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <figure>
            <Photo photo={PHOTOS.barber} sizes="(min-width: 640px) 50vw, 100vw" className="aspect-[4/5] rounded-[6px]" />
            <figcaption className="mt-3 text-[14px] text-muted">Barbers and salons: one link for every chair.</figcaption>
          </figure>
          <figure className="sm:mt-24">
            <Photo photo={PHOTOS.waitingRoom} sizes="(min-width: 640px) 50vw, 100vw" className="aspect-[4/5] rounded-[6px]" />
            <figcaption className="mt-3 text-[14px] text-muted">Clinics: fewer calls at the desk, fewer empty chairs.</figcaption>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------- under the hood */}
      <section className="border-t border-ink/10 bg-paper">
        <div className="mx-auto grid grid-cols-1 max-w-7xl gap-12 px-5 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">Under the hood</h2>
            <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-ink-2">
              Next.js 16, React 19 and Postgres with Drizzle. The front-desk assistant answers in English and Arabic from the live schedule, and changes nothing until the owner confirms. The database enforces the rules; the tests run against a real Postgres engine.
            </p>
            <a href="https://github.com/darkxgs/mawid" className={buttonClass("dark", "md", "mt-6")}>
              Read the source
            </a>
          </div>
          <dl className="grid grid-cols-1 gap-x-12 gap-y-8 sm:grid-cols-2">
            {ENGINEERING.map(([t, b]) => (
              <div key={t} className="border-t border-ink/15 pt-4">
                <dt className="text-[16px] font-semibold">{t}</dt>
                <dd className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------- closing */}
      <section className="relative isolate overflow-hidden bg-sea-deep text-white">
        <Photo photo={PHOTOS.treatmentRoom} sizes="100vw" className="absolute inset-0 -z-10 opacity-35" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-8 px-5 py-24 sm:px-10">
          <h2 className="font-display max-w-2xl text-[34px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:text-[48px]">
            See it from both sides of the desk.
          </h2>
          <div className="flex flex-wrap gap-3">
            <form action={demoLogin}>
              <button type="submit" className={buttonClass("saffron", "lg", "px-6")}>
                Open the demo clinic
              </button>
            </form>
            <Link href="/b/noor-dental" className="inline-flex h-12 items-center rounded-[12px] px-6 text-[15px] font-medium ring-1 ring-white/50 ring-inset hover:bg-white/10">
              Book as a patient
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[14px] text-muted sm:px-10">
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
