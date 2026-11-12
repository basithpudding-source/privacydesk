"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePrefs } from "@/lib/prefs-client";
import { DEFAULT_PREFS, type Prefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { saveDisplayName, type NameState } from "./actions";

export function NameForm({ initial }: { initial: string }) {
  const [state, formAction, pending] = useActionState<NameState, FormData>(saveDisplayName, { error: null, saved: false });
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="display_name">Your name</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="display_name" name="display_name" defaultValue={initial} maxLength={80} autoComplete="name" placeholder="How you want to be shown" className="max-w-xs bg-card" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        {state.saved && !pending && (
          <span className="text-sm text-ok-fg" role="status">
            Saved.
          </span>
        )}
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">{state.error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Shown at the top of the app. Other people still see your actions on the audit trail by your account, not this name.</p>
      )}
    </form>
  );
}

interface Choice<K extends keyof Prefs> {
  key: K;
  title: string;
  help: string;
  options: { value: Prefs[K]; label: string }[];
}

const CHOICES: [Choice<"theme">, Choice<"density">, Choice<"nav">, Choice<"preview">, Choice<"openCases">] = [
  {
    key: "theme",
    title: "Theme",
    help: "“Match my device” follows the light or dark setting of your computer.",
    options: [
      { value: "system", label: "Match my device" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  {
    key: "density",
    title: "Table rows",
    help: "Compact fits more rows on the screen; comfortable gives each row more room.",
    options: [
      { value: "comfortable", label: "Comfortable" },
      { value: "compact", label: "Compact" },
    ],
  },
  {
    key: "nav",
    title: "Navigation",
    help: "Across the top leaves the full width for tables; down the left keeps the sections beside the work.",
    options: [
      { value: "top", label: "Across the top" },
      { value: "side", label: "Down the left" },
    ],
  },
  {
    key: "preview",
    title: "Case preview",
    help: "Where the preview opens when you use the panel button on a row of the case list.",
    options: [
      { value: "right", label: "Beside the list" },
      { value: "below", label: "Below the list" },
    ],
  },
  {
    key: "openCases",
    title: "Opening a case",
    help: "A new window keeps the list where it was, so there is no going back and forth.",
    options: [
      { value: "same", label: "In this window" },
      { value: "new", label: "In a new window" },
    ],
  },
];

/**
 * Look and layout. Each choice is saved the moment it is picked, in this browser, and the
 * page redraws with it; there is no save button to forget.
 */
export function PreferencesForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);

  function choose<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    router.refresh();
  }

  const changed = CHOICES.some((c) => prefs[c.key] !== DEFAULT_PREFS[c.key]);

  return (
    <div className="flex flex-col gap-5">
      {CHOICES.map((c) => (
        <fieldset key={c.key}>
          <legend className="text-sm font-medium">{c.title}</legend>
          <div className="mt-1.5 flex w-fit flex-wrap rounded-lg border border-border bg-card p-0.5">
            {c.options.map((o) => {
              const on = prefs[c.key] === o.value;
              return (
                <label
                  key={String(o.value)}
                  className={cn(
                    "flex h-8 cursor-pointer items-center rounded-md px-3 text-sm outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    on ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input type="radio" name={c.key} value={String(o.value)} checked={on} onChange={() => choose(c.key, o.value as never)} className="sr-only" />
                  {o.label}
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{c.help}</p>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={!changed}
          onClick={() => {
            const next = { ...DEFAULT_PREFS, caseColumns: prefs.caseColumns };
            setPrefs(next);
            savePrefs(next);
            router.refresh();
          }}
        >
          Back to the standard look
        </Button>
        <p className="text-xs text-muted-foreground">These choices are kept in this browser. On another computer you choose again.</p>
      </div>
    </div>
  );
}
