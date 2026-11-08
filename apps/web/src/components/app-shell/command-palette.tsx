"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { createClient } from "@/lib/supabase/client";

interface CaseHit {
  id: string;
  ref: string;
  summary: string | null;
  status: string;
}

export function CommandPalette({ open, onOpenChange, canWrite }: { open: boolean; onOpenChange: (open: boolean) => void; canWrite: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CaseHit[]>([]);

  // Cases by reference or summary, through the user's own client so RLS applies.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const supabase = createClient();
    let cancelled = false;
    const run = async () => {
      let req = supabase.from("cases").select("id, ref, summary, status").order("updated_at", { ascending: false }).limit(8);
      if (q) req = req.or(`ref.ilike.%${q.replace(/[%,()]/g, "")}%,summary.ilike.%${q.replace(/[%,()]/g, "")}%`);
      const { data } = await req;
      if (!cancelled) setHits((data ?? []) as CaseHit[]);
    };
    const t = setTimeout(run, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump to a page or a case">
      <CommandInput placeholder="Type a case reference, or a page…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/cases")}>
            <FolderOpen aria-hidden="true" /> Cases
          </CommandItem>
          <CommandItem onSelect={() => go("/clients")}>
            <Building2 aria-hidden="true" /> Clients
          </CommandItem>
          <CommandItem onSelect={() => go("/settings/security")}>
            <ShieldCheck aria-hidden="true" /> Security
          </CommandItem>
        </CommandGroup>
        {canWrite && (
          <CommandGroup heading="Do">
            <CommandItem onSelect={() => go("/cases/new")}>
              <Plus aria-hidden="true" /> Log a case
            </CommandItem>
            <CommandItem onSelect={() => go("/clients/new")}>
              <Plus aria-hidden="true" /> Add client
            </CommandItem>
          </CommandGroup>
        )}
        {hits.length > 0 && (
          <CommandGroup heading="Cases">
            {hits.map((h) => (
              <CommandItem key={h.id} value={`${h.ref} ${h.summary ?? ""}`} onSelect={() => go(`/cases/${h.id}`)}>
                <span className="font-mono text-xs">{h.ref}</span>
                <span className="truncate text-muted-foreground">{h.summary ?? (h.status === "closed" ? "Closed" : "")}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
