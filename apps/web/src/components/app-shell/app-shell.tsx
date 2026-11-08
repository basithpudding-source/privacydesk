import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/auth";
import { NavLinks } from "./nav-links";
import { Shortcuts } from "./shortcuts";

/**
 * Three-column desktop layout from the design standard: a 220 px nav rail, the content,
 * and room for a detail panel later. On phones the rail becomes a bottom bar.
 */
export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <Shortcuts canWrite={user.membership?.role !== "read_only"} />
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4 md:flex">
        <Link href="/clients" className="px-3 text-sm font-semibold tracking-tight">
          Privacy Desk
        </Link>
        <p className="mt-1 truncate px-3 text-xs text-muted-foreground" title={user.membership?.partnerName}>
          {user.membership?.partnerName ?? "No consultancy yet"}
        </p>
        <nav aria-label="Main" className="mt-6">
          <NavLinks variant="rail" />
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
          <Link
            href="/settings/security"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            Security
          </Link>
          <p className="truncate px-3 text-xs text-muted-foreground" title={user.email ?? undefined}>
            {user.email}
          </p>
          <form action="/auth/sign-out" method="post" className="px-3">
            <Button type="submit" variant="link" size="sm" className="h-auto px-0 text-muted-foreground">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-8 md:pb-10">{children}</main>
        <footer className="hidden px-8 pb-6 text-xs text-muted-foreground md:block">
          Privacy Desk is software, not legal advice.
        </footer>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-border bg-background px-2 py-1 md:hidden"
      >
        <NavLinks variant="bar" />
      </nav>
    </div>
  );
}
