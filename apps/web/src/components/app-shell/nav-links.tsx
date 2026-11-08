"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Gauge, Inbox, FileText, FolderOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shortcut hint shown in the tooltip once shortcuts exist (slice 3). */
  ready: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox, ready: false },
  { href: "/cases", label: "Cases", icon: FolderOpen, ready: false },
  { href: "/clients", label: "Clients", icon: Building2, ready: true },
  { href: "/dashboard", label: "Dashboard", icon: Gauge, ready: false },
  { href: "/report", label: "Report", icon: FileText, ready: false },
];

export function NavLinks({ variant }: { variant: "rail" | "bar" }) {
  const pathname = usePathname();

  return (
    <ul className={cn("flex gap-1", variant === "rail" ? "flex-col" : "flex-row justify-around")}>
      {NAV_ITEMS.map(({ href, label, icon: Icon, ready }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const base = cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          variant === "bar" && "flex-col gap-1 px-2 py-1.5 text-xs",
        );
        if (!ready) {
          return (
            <li key={href}>
              <span
                className={cn(base, "cursor-not-allowed text-muted-foreground/60")}
                title="Coming in a later build slice"
                aria-disabled="true"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </span>
            </li>
          );
        }
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                base,
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
