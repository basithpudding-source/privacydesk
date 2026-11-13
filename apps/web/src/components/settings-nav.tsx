import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "profile", href: "/settings/profile", label: "Your profile", adminOnly: false },
  { key: "security", href: "/settings/security", label: "Security", adminOnly: false },
  { key: "team", href: "/settings/team", label: "Team and access", adminOnly: true },
] as const;

/** The settings pages, side by side under the page heading. The team page is for administrators. */
export function SettingsNav({ current, isAdmin }: { current: (typeof ITEMS)[number]["key"]; isAdmin: boolean }) {
  return (
    <nav aria-label="Settings" className="mt-5 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-x-1">
        {ITEMS.filter((i) => isAdmin || !i.adminOnly).map((i) => (
          <li key={i.key}>
            <Link
              href={i.href}
              aria-current={i.key === current ? "page" : undefined}
              className={cn(
                "inline-block rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                i.key === current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
