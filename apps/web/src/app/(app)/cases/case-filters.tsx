"use client";

import { useDesk } from "@/components/desk-context";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CASE_TYPES } from "@/lib/cases/labels";
import type { CaseFilters as Filters } from "@/lib/cases/queries";
import { shortDate } from "@/lib/clocks";
import { cn } from "@/lib/utils";

const STATUSES: { value: Filters["status"]; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due in 7 days" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const SHOW_LABELS = { today: "Due today", soon: "Due in 1 to 5 days", onTrack: "On track", notRunning: "Clock not running" } as const;

const selectClass = cn(
  "h-8 rounded-lg border border-input bg-card px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

export function CaseFilters({ filters, clients }: { filters: Filters; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const { words } = useDesk();
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box (design standard §2). The shortcut layer dispatches this event.
  useEffect(() => {
    const onFocusSearch = () => searchRef.current?.focus();
    window.addEventListener("pd:focus-search", onFocusSearch);
    return () => window.removeEventListener("pd:focus-search", onFocusSearch);
  }, []);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/cases?${next.toString()}`);
  }

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        update("q", searchRef.current?.value.trim() ?? "");
      }}
    >
      {/* Status is the filter people change most, so every choice is one click and always in view. */}
      <div role="group" aria-label="Status" className="flex rounded-lg border border-border bg-card p-0.5">
        {STATUSES.map((s) => {
          const on = filters.status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={on}
              onClick={() => update("status", s.value === "open" ? "" : s.value)}
              className={cn(
                "h-7 rounded-md px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div>
        <Label htmlFor="f-type" className="sr-only">Type</Label>
        <select id="f-type" className={selectClass} value={filters.type} onChange={(e) => update("type", e.target.value)}>
          <option value="">All types</option>
          {CASE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      {words.hasClients && (
        <div>
          <Label htmlFor="f-client" className="sr-only">Client</Label>
          <select id="f-client" className={selectClass} value={filters.client} onChange={(e) => update("client", e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      {(filters.show || filters.due) && (
        // A narrowing that came from the dashboard: say what it is and let it be removed.
        <button
          type="button"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.delete("show");
            next.delete("due");
            router.replace(`/cases?${next.toString()}`);
          }}
          title="Remove this filter"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ring/50 bg-accent px-2.5 text-sm font-medium text-accent-foreground outline-none hover:bg-accent/70 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {filters.due ? `Due ${shortDate(filters.due)}` : SHOW_LABELS[filters.show as Exclude<typeof filters.show, "">]}
          <X className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Remove this filter</span>
        </button>
      )}
      <div className="relative min-w-[14rem] flex-1">
        <Label htmlFor="f-q" className="sr-only">Search</Label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="f-q"
          ref={searchRef}
          type="search"
          defaultValue={filters.q}
          placeholder="Search ref, name, email, subject or summary (press /)"
          className="h-8 bg-card pl-8"
          onBlur={(e) => {
            if (e.target.value.trim() !== filters.q) update("q", e.target.value.trim());
          }}
        />
      </div>
    </form>
  );
}
