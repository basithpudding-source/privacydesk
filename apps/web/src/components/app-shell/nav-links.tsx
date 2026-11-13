"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Gauge, Inbox, FileText, FolderOpen, type LucideIcon } from "lucide-react";
import { useDesk } from "@/components/desk-context";
import type { DeskWords } from "@/lib/desk";
import type { NavCounts } from "@/lib/nav-counts";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the tooltip so people learn shortcuts by using the app. */
  shortcut: string;
}

/** The fifth section is the clients for a consultancy, and the organisation's own settings for an organisation. */
function navItems(words: DeskWords): NavItem[] {
  return [
    { href: "/inbox", label: "Inbox", icon: Inbox, shortcut: "G then I" },
    { href: "/cases", label: "Cases", icon: FolderOpen, shortcut: "G then C" },
    { href: "/dashboard", label: "Dashboard", icon: Gauge, shortcut: "G then D" },
    { href: "/report", label: "Report", icon: FileText, shortcut: "G then R" },
    { href: words.section.href, label: words.section.label, icon: Building2, shortcut: "G then L" },
  ];
}

/** The count beside a nav item, with words for screen readers. */
function countFor(href: string, counts: NavCounts): { n: number; words: string; urgent: boolean } | null {
  if (href === "/inbox" && counts.inbox > 0) return { n: counts.inbox, words: "waiting", urgent: false };
  if (href === "/cases" && counts.overdue > 0) return { n: counts.overdue, words: "overdue", urgent: true };
  return null;
}

/** The five sections: across the top bar ("top"), down a side rail ("rail"), or along the bottom on a phone ("bar"). */
export function NavLinks({ variant, counts }: { variant: "top" | "rail" | "bar"; counts: NavCounts }) {
  const pathname = usePathname();
  const { words } = useDesk();

  return (
    <ul className={cn("flex", variant === "rail" ? "flex-col gap-0.5" : "flex-row", variant === "top" && "h-full items-stretch gap-1")}>
      {navItems(words).map(({ href, label, icon: Icon, shortcut }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const count = countFor(href, counts);
        const badge = count && (
          <span
            className={cn(
              "rounded-full text-center font-semibold tabular-nums",
              variant === "bar" ? "absolute -right-2.5 -top-1.5 min-w-4 px-1 text-[10px] leading-4" : "min-w-5 px-1.5 text-xs leading-5",
              variant === "rail" && "ml-auto",
              count.urgent ? "bg-danger text-white" : variant === "bar" ? "bg-primary text-primary-foreground" : "bg-sidebar-primary text-sidebar-primary-foreground",
            )}
          >
            {count.n}
            <span className="sr-only"> {count.words}</span>
          </span>
        );
        return (
          <li key={href} className={variant === "bar" ? "flex-1" : variant === "top" ? "flex" : undefined}>
            <Link
              href={href}
              title={`${label} (${shortcut})`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center outline-none focus-visible:ring-3",
                variant !== "bar"
                  ? cn(
                      "rounded-lg text-sm font-medium focus-visible:ring-sidebar-ring/60",
                      variant === "top" ? "gap-2 self-center px-3 py-1.5" : "gap-3 px-3 py-2",
                      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )
                  : cn("flex-col gap-1 rounded-lg px-2 py-1.5 text-xs font-medium focus-visible:ring-ring/50", active ? "text-primary" : "text-muted-foreground hover:text-foreground"),
              )}
            >
              {/* The line under the current section, so the place is marked by more than a shade. */}
              {variant === "top" && active && <span className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-sidebar-primary" aria-hidden="true" />}
              {variant === "rail" && active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary" aria-hidden="true" />}
              <span className="relative">
                <Icon className={variant === "bar" ? "size-5" : "size-4"} aria-hidden="true" />
                {variant === "bar" && badge}
              </span>
              {label}
              {variant !== "bar" && badge}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
