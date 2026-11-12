"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A client filter kept in the URL (?client=), shared by the dashboard and the report. */
export function ClientPicker({ clients, value, allowAll = true, extra }: { clients: { id: string; name: string }[]; value: string; allowAll?: boolean; extra?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(key: string, v: string) {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(key, v);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div>
        <Label htmlFor="f-client" className="sr-only">Client</Label>
        <select
          id="f-client"
          value={value}
          onChange={(e) => update("client", e.target.value)}
          className={cn("h-9 rounded-lg border border-input bg-card px-2.5 text-sm", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}
        >
          {allowAll && <option value="">All clients</option>}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {extra}
    </div>
  );
}

/** A month filter (?month=YYYY-MM) to sit beside the client picker. */
export function MonthPicker({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div>
      <Label htmlFor="f-month" className="sr-only">Month</Label>
      <input
        id="f-month"
        type="month"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set("month", e.target.value);
          else next.delete("month");
          router.replace(`${pathname}?${next.toString()}`);
        }}
        className={cn("h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}
      />
    </div>
  );
}
