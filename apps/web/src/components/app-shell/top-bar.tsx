"use client";

import Link from "next/link";
import { Keyboard, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

/**
 * The bar above every page: find a case or jump anywhere (the command palette), log a case,
 * and the shortcut list. The buttons raise the same events the keyboard layer listens for.
 */
export function TopBar({ canWrite }: { canWrite: boolean }) {
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-canvas/85 px-4 backdrop-blur sm:px-8">
      <Link href="/cases" className="text-sm font-semibold tracking-tight md:hidden">
        Privacy Desk
      </Link>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("pd:open-palette"))}
        title="Find a case or jump to a page (Ctrl K)"
        className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground outline-none hover:border-ring/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:ml-0 md:w-80"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left sm:inline">Find a case or jump to…</span>
        <span className="sr-only sm:hidden">Find a case or jump to a page</span>
        <span className="hidden items-center gap-1 md:flex" aria-hidden="true">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="flex items-center gap-2 md:ml-auto">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="hidden text-muted-foreground md:inline-flex"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          onClick={() => window.dispatchEvent(new Event("pd:open-help"))}
        >
          <Keyboard aria-hidden="true" />
        </Button>
        {canWrite && (
          <Button size="lg" render={<Link href="/cases/new" />} nativeButton={false} title="Log a case by hand (C)">
            <Plus data-icon="inline-start" aria-hidden="true" />
            Log a case
          </Button>
        )}
      </div>
    </div>
  );
}
