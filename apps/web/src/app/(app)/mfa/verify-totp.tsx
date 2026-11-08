"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function VerifyTotp({ factorId, nextHref }: { factorId: string; nextHref: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setError("That code did not match. Codes change every 30 seconds; enter the current one.");
      setCode("");
      return;
    }
    router.push(nextHref);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Not signed in yet</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Six-digit code from your authenticator app</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-32 font-mono text-lg tracking-widest"
        />
      </div>
      <div>
        <Button type="submit" disabled={busy || code.trim().length !== 6}>
          {busy ? "Checking…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
