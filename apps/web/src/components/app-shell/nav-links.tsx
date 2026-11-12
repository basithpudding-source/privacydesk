"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Gauge, Inbox, FileText, FolderOpen, type LucideIcon } from "lucide-react";
import type { NavCounts } from "@/lib/nav-counts";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the tooltip so people learn shortcuts by using the app. */
  shortcut: string;
  group: "Work" | "Overview" | "Setup";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox, shortcut: "G then I", group: "Work" },
  { href: "/cases", label: "Cases", icon: FolderOpen, shortcut: "G then C", group: "Work" },
  { href: "/dashboard", label: "Dashboard", icon: Gauge, shortcut: "G then D", group: "Overview" },
  { href: "/report", label: "Report", icon: FileText, shortcut: "G then R", group: "Overview" },
  { href: "/clients", label: "Clients", icon: Building2, shortcut: "G then L", group: "Setup" },
];

const GROUPS: NavItem["group"][] = ["Work", "Overview", "Setup"];

/** The count beside a nav item, with words for screen readers. */
function countFor(href: string, counts: NavCounts): { n: number; words: string; urgent: boolean } | null {
  if (href === "/inbox" && counts.inbox > 0) return { n: counts.inbox, words: "waiting", urgent: false };
  if (href === "/cases" && counts.overdue > 0) return { n: counts.overdue, words: "overdue", urgent: true };
  return null;
}

export function NavLinks({ variant, counts }: { variant: "rail" | "bar"; counts: NavCounts }) {
  const pathname = usePathname();

  const link = ({ href, label, icon: Icon, shortcut }: NavItem) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    const count = countFor(href, counts);
    return (
      <li key={href} className={variant === "bar" ? "flex-1" : undefined}>
        <Link
          href={href}
          title={`${label} (${shortcut})`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex items-center outline-none focus-visible:ring-3",
            variant === "rail"
              ? cn(
                  "gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-sidebar-ring/60",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )
              : cn(
                  "flex-col gap-1 rounded-lg px-2 py-1.5 text-xs font-medium focus-visible:ring-ring/50",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                ),
          )}
        >
          {variant === "rail" && active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary" aria-hidden="true" />}
          <span className="relative">
            <Icon className={variant === "rail" ? "size-4" : "size-5"} aria-hidden="true" />
            {variant === "bar" && count && (
              <span className={cn("absolute -right-2.5 -top-1.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 tabular-nums", count.urgent ? "bg-danger text-white" : "bg-primary text-primary-foreground")}>
                {count.n}
                <span className="sr-only"> {count.words}</span>
              </span>
            )}
          </span>
          {label}
          {variant === "rail" && count && (
            <span className={cn("ml-auto min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5 tabular-nums", count.urgent ? "bg-danger text-white" : "bg-sidebar-primary text-sidebar-primary-foreground")}>
              {count.n}
              <span className="sr-only"> {count.words}</span>
            </span>
          )}
        </Link>
      </li>
    );
  };

  if (variant === "bar") return <ul className="flex flex-row">{NAV_ITEMS.map(link)}</ul>;

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">{group}</p>
          <ul className="flex flex-col gap-0.5">{NAV_ITEMS.filter((i) => i.group === group).map(link)}</ul>
        </div>
      ))}
    </div>
  );
}
