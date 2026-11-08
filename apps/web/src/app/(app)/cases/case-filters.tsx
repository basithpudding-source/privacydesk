"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
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
  "h-8 rounded-lg border border-input bg-background px-2.5 text-sm",
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
      className="mt-6 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        update("q", searchRef.current?.value.trim() ?? "");
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-status" className="text-xs">Status</Label>
        <select id="f-status" className={selectClass} value={filters.status} onChange={(e) => update("status", e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-type" className="text-xs">Type</Label>
        <select id="f-type" className={selectClass} value={filters.type} onChange={(e) => update("type", e.target.value)}>
          <option value="">All types</option>
          {CASE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-client" className="text-xs">Client</Label>
        <select id="f-client" className={selectClass} value={filters.client} onChange={(e) => update("client", e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
        <Label htmlFor="f-q" className="text-xs">Search</Label>
        <Input
          id="f-q"
          ref={searchRef}
          type="search"
          defaultValue={filters.q}
          placeholder="Ref, name, email or summary (press /)"
          onBlur={(e) => {
            if (e.target.value.trim() !== filters.q) update("q", e.target.value.trim());
          }}
        />
      </div>
    </form>
  );
}
