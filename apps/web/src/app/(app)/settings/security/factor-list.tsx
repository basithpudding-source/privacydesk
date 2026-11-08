"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export interface FactorSummary {
  id: string;
  name: string;
  since: string;
}

export function FactorList({ factors, canRemove }: { factors: FactorSummary[]; canRemove: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Remove this authenticator? You will be asked to set one up again before you can use the desk.")) return;
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      setError(`Could not remove it: ${error.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {factors.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{f.name}</p>
              <p className="text-muted-foreground">Added {f.since}</p>
            </div>
            {canRemove && (
              <Button variant="outline" size="sm" onClick={() => remove(f.id)}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
