import { ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { SideNav, TopNav } from "@/components/dashboard/nav";
import { buttonClass } from "@/components/ui";
import { DEMO } from "@/db/seed";
import { requireBusiness } from "@/server/auth";
import { logout } from "../(auth)/actions";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  await connection();
  const { business } = await requireBusiness();
  const isDemo = business.id === DEMO.businessId;
  const publicHref = `/b/${business.slug}`;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-mist bg-paper px-4 py-5 lg:flex">
        <Link href="/dashboard" className="px-2">
          <Logo />
        </Link>
        <div className="mt-7 rounded-[12px] border border-mist bg-card p-3">
          <p className="truncate text-[14px] font-medium">{business.name}</p>
          <a href={publicHref} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-sea hover:underline">
            Booking page
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
        <div className="mt-6">
          <SideNav />
        </div>
        <form action={logout} className="mt-auto">
          <button type="submit" className="flex h-9 w-full items-center gap-3 rounded-[9px] px-3 text-[14px] text-muted transition-colors hover:bg-mist-2 hover:text-ink">
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </form>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-mist glass px-4 pt-3 pb-2 lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <Link href="/dashboard">
              <Logo />
            </Link>
            <a href={publicHref} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
              Booking page
            </a>
          </div>
          <TopNav />
        </header>
        {isDemo ? (
          <div className="border-b border-saffron/30 bg-saffron-soft px-4 py-2 text-[13px] text-ink sm:px-8">
            This is the demo clinic. Book a visit on{" "}
            <a href={publicHref} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
              its booking page
            </a>{" "}
            and watch it appear here.
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="hidden border-e border-mist px-4 py-5 lg:block">
        <Logo />
      </aside>
      <div className="p-8">
        <div className="h-8 w-56 animate-pulse rounded bg-mist" />
        <div className="mt-8 h-[60vh] animate-pulse rounded-panel bg-mist-2" />
      </div>
    </div>
  );
}
