"use client";

import {
  BarChart3,
  CalendarDays,
  Layers,
  ListChecks,
  MessageCircle,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export const NAV = [
  { href: "/dashboard", label: "Today", icon: CalendarDays },
  { href: "/dashboard/bookings", label: "Bookings", icon: ListChecks },
  { href: "/dashboard/assistant", label: "Assistant", icon: MessagesSquare },
  { href: "/dashboard/messages", label: "Messages", icon: MessageCircle },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart3 },
  { href: "/dashboard/services", label: "Services", icon: Layers },
  { href: "/dashboard/team", label: "Team & hours", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-[9px] px-3 text-[14px] transition-colors",
              active ? "bg-card font-medium text-ink shadow-[0_1px_2px_rgb(15_46_53/0.08)] ring-1 ring-mist" : "text-ink-2 hover:bg-mist-2 hover:text-ink",
            )}
          >
            <Icon className={cn("size-4", active ? "text-sea" : "text-muted")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Dashboard" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4">
      {NAV.map(({ href, label }) => {
        const active = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-8 shrink-0 rounded-full px-3 text-[13px] leading-8 whitespace-nowrap transition-colors",
              active ? "bg-ink text-white" : "text-ink-2 hover:bg-mist-2",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
