import Link from "next/link";
import { Logo } from "@/components/brand";
import { ScheduleArt } from "@/components/marketing/schedule-art";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="self-start">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_0%,#1d6b66_0%,transparent_60%)] opacity-70" />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 xl:px-20">
          <p className="font-display max-w-md text-[34px] leading-[1.15] font-semibold text-white text-balance">
            Your patients book on WhatsApp time, not office hours.
          </p>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/65">
            Mawid takes bookings around the clock, reminds people before they forget, and keeps every chair on one live schedule.
          </p>
          <ScheduleArt className="mt-12 max-w-[520px]" />
        </div>
      </aside>
    </div>
  );
}
