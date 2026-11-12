"use client";

import Link from "next/link";
import { Keyboard, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const iconButton =
  "flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60";

/**
 * The right-hand tools of the top bar: find a case or jump anywhere (the command palette),
 * the shortcut list, and Log a case. The buttons raise the same events the keyboard layer
 * listens for.
 */
export function TopBarTools({ canWrite, layout }: { canWrite: boolean; layout: "bar" | "rail" }) {
  const rail = layout === "rail";
  return (
    <>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("pd:open-palette"))}
        title="Find a case or jump to a page (Ctrl K)"
        className={`flex h-9 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3 text-sm text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/60 ${rail ? "w-full" : "lg:w-64 xl:w-80"}`}
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className={rail ? "flex-1 text-left" : "hidden flex-1 text-left lg:inline"}>{rail ? "Find or jump to…" : "Find a case or jump to…"}</span>
        {!rail && <span className="sr-only lg:hidden">Find a case or jump to a page</span>}
        <kbd className="hidden rounded border border-sidebar-border px-1.5 font-sans text-[11px] leading-5 text-sidebar-foreground/60 lg:inline" aria-hidden="true">
          Ctrl K
        </kbd>
      </button>
      <button type="button" className={`${iconButton} ${rail ? "hidden" : "hidden md:flex"}`} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => window.dispatchEvent(new Event("pd:open-help"))}>
        <Keyboard className="size-4" aria-hidden="true" />
      </button>
      {canWrite && (
        <Button size="lg" className={`bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/85 ${rail ? "w-full" : ""}`} render={<Link href="/cases/new" />} nativeButton={false} title="Log a case by hand (C)">
          <Plus data-icon="inline-start" aria-hidden="true" />
          <span className={rail ? "" : "hidden sm:inline"}>Log a case</span>
          {!rail && <span className="sr-only sm:hidden">Log a case</span>}
        </Button>
      )}
    </>
  );
}
