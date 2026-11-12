import Link from "next/link";
import { LogOut, ShieldCheck, Timer } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import type { NavCounts } from "@/lib/nav-counts";
import { NavLinks } from "./nav-links";
import { Shortcuts } from "./shortcuts";
import { TopBar } from "./top-bar";

const railLink =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60";

/**
 * Three-column desktop layout from the design standard: a 220 px nav rail, the content,
 * and room for a detail panel. The rail is dark so the working area reads as the page;
 * on phones it becomes a bottom bar.
 */
export function AppShell({ user, counts, children }: { user: CurrentUser; counts: NavCounts; children: React.ReactNode }) {
  const canWrite = user.membership?.role !== "read_only";
  return (
    <div className="flex min-h-full flex-1 bg-canvas">
      <Shortcuts canWrite={canWrite} />
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col bg-sidebar px-3 py-4 text-sidebar-foreground md:flex">
        <Link href="/cases" className="flex items-center gap-2.5 rounded-lg px-2 py-1 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/60">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground" aria-hidden="true">
            <Timer className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight tracking-tight">Privacy Desk</span>
            <span className="block truncate text-xs leading-tight text-sidebar-foreground/60" title={user.membership?.partnerName}>
              {user.membership?.partnerName ?? "No consultancy yet"}
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="mt-7">
          <NavLinks variant="rail" counts={counts} />
        </nav>

        <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
          <Link href="/settings/security" className={railLink}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            Security
          </Link>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className={`${railLink} w-full`}>
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
          <p className="mt-2 truncate px-3 text-xs text-sidebar-foreground/60" title={user.email ?? undefined}>
            {user.email}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar canWrite={canWrite} />
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-8 md:pb-10 md:pt-8">{children}</main>
        <footer className="hidden px-8 pb-6 text-xs text-muted-foreground md:block">Privacy Desk is software, not legal advice.</footer>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-2 py-1 md:hidden">
        <NavLinks variant="bar" counts={counts} />
      </nav>
    </div>
  );
}
