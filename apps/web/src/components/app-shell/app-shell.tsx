import Link from "next/link";
import { LogOut, Timer } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import type { NavCounts } from "@/lib/nav-counts";
import type { Prefs } from "@/lib/prefs";
import { NavLinks } from "./nav-links";
import { Shortcuts } from "./shortcuts";
import { TopBarTools } from "./top-bar";

const iconLink =
  "flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60";
const railLink =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60";

/** Two letters for the round profile button: from the name if there is one, else the email. */
function initials(user: CurrentUser): string {
  const source = (user.name || user.email || "?").trim();
  const words = source.split(/[\s._@-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (user.name ? (words[1]?.[0] ?? "") : "")).toUpperCase();
}

/**
 * The frame around every signed-in page. By default one dark bar across the top holds the
 * five sections and the tools, so the whole width below belongs to the work. People who
 * prefer the sections down the left can choose that in their profile (the "nav" preference).
 * On phones the sections are always a bottom bar.
 */
export function AppShell({ user, counts, prefs, children }: { user: CurrentUser; counts: NavCounts; prefs: Prefs; children: React.ReactNode }) {
  const canWrite = user.membership?.role !== "read_only";
  const side = prefs.nav === "side";
  const who = user.name || user.email || "your profile";

  const brand = (
    <Link href="/cases" className="flex items-center gap-2.5 rounded-lg py-1 pr-2 outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/60" title={user.membership?.partnerName}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground" aria-hidden="true">
        <Timer className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight tracking-tight">Privacy Desk</span>
        <span className={side ? "block max-w-36 truncate text-xs leading-tight text-sidebar-foreground/60" : "hidden max-w-40 truncate text-xs leading-tight text-sidebar-foreground/60 xl:block"}>
          {user.membership?.partnerName ?? "No consultancy yet"}
        </span>
      </span>
    </Link>
  );
  const avatar = (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground" aria-hidden="true">
      {initials(user)}
    </span>
  );

  return (
    <div className={side ? "flex min-h-full flex-1 bg-canvas" : "flex min-h-full flex-1 flex-col bg-canvas"}>
      <Shortcuts canWrite={canWrite} />

      {side && (
        <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col gap-4 bg-sidebar px-3 py-4 text-sidebar-foreground md:flex">
          {brand}
          <div className="flex flex-col gap-2">
            <TopBarTools canWrite={canWrite} layout="rail" />
          </div>
          <nav aria-label="Main">
            <NavLinks variant="rail" counts={counts} />
          </nav>
          <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
            <Link href="/settings/profile" className={railLink} title="Your profile and preferences">
              {avatar}
              <span className="truncate">{who}</span>
            </Link>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className={`${railLink} w-full`}>
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The top bar: always on phones (the rail is hidden there), and on desktops unless the rail is chosen. */}
        <header className={`sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-3 text-sidebar-foreground sm:px-5 ${side ? "md:hidden" : ""}`}>
          <span className="mr-2">{brand}</span>
          {!side && (
            <nav aria-label="Main" className="hidden h-full md:block">
              <NavLinks variant="top" counts={counts} />
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <TopBarTools canWrite={canWrite} layout="bar" />
            <span className="mx-1 hidden h-6 w-px bg-sidebar-border md:block" aria-hidden="true" />
            <Link href="/settings/profile" className={iconLink} title={`Your profile and preferences (${who})`} aria-label="Your profile and preferences">
              {avatar}
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
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-2 py-1 md:hidden">
        <NavLinks variant="bar" counts={counts} />
      </nav>
    </div>
  );
}
