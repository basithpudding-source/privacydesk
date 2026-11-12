import Link from "next/link";
import { LogOut, ShieldCheck, Timer } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import type { NavCounts } from "@/lib/nav-counts";
import { NavLinks } from "./nav-links";
import { Shortcuts } from "./shortcuts";
import { TopBarTools } from "./top-bar";

const iconLink =
  "flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60";

/**
 * One dark bar across the top holds the five sections and the tools, so the whole width of
 * the window below it belongs to the work: wide tables and side-by-side panes. With only
 * five sections a top bar is enough; a side rail spent 220 px on every screen. On phones the
 * sections move to a bottom bar.
 */
export function AppShell({ user, counts, children }: { user: CurrentUser; counts: NavCounts; children: React.ReactNode }) {
  const canWrite = user.membership?.role !== "read_only";
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <Shortcuts canWrite={canWrite} />
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-3 text-sidebar-foreground sm:px-5">
        <Link href="/cases" className="mr-2 flex items-center gap-2.5 rounded-lg py-1 pr-2 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/60" title={user.membership?.partnerName}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground" aria-hidden="true">
            <Timer className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight tracking-tight">Privacy Desk</span>
            <span className="hidden max-w-40 truncate text-xs leading-tight text-sidebar-foreground/60 xl:block">{user.membership?.partnerName ?? "No consultancy yet"}</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden h-full md:block">
          <NavLinks variant="top" counts={counts} />
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <TopBarTools canWrite={canWrite} />
          <span className="mx-1 hidden h-6 w-px bg-sidebar-border md:block" aria-hidden="true" />
          <Link href="/settings/security" className={`${iconLink} hidden md:flex`} title={`Security (signed in as ${user.email ?? "you"})`} aria-label="Security">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </Link>
          <form action="/auth/sign-out" method="post" className="hidden md:block">
            <button type="submit" className={iconLink} title="Sign out" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-8 xl:px-8">{children}</main>
      <footer className="hidden px-6 pb-5 text-xs text-muted-foreground md:block xl:px-8">Privacy Desk is software, not legal advice.</footer>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-2 py-1 md:hidden">
        <NavLinks variant="bar" counts={counts} />
      </nav>
    </div>
  );
}
