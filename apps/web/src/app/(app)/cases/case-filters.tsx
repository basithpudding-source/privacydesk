"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CASE_TYPES } from "@/lib/cases/labels";
import type { CaseFilters as Filters } from "@/lib/cases/queries";
import { cn } from "@/lib/utils";

const STATUSES: { value: Filters["status"]; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "week", label: "Due in 7 days" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const selectClass = cn(
  "h-8 rounded-lg border border-input bg-card px-2.5 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

export function CaseFilters({ filters, clients }: { filters: Filters; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
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
      className="mt-6 flex flex-wrap items-center gap-3"
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
      <div>
        <Label htmlFor="f-client" className="sr-only">Client</Label>
        <select id="f-client" className={selectClass} value={filters.client} onChange={(e) => update("client", e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="relative min-w-[14rem] flex-1">
        <Label htmlFor="f-q" className="sr-only">Search</Label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="f-q"
          ref={searchRef}
          type="search"
          defaultValue={filters.q}
          placeholder="Search ref, name, email or summary (press /)"
          className="h-8 bg-card pl-8"
          onBlur={(e) => {
            if (e.target.value.trim() !== filters.q) update("q", e.target.value.trim());
          }}
        />
      </div>
    </form>
  );
}
