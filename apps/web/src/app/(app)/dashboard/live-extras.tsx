"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Reload the dashboard's numbers every five minutes while the tab is in view. */
export function AutoRefresh({ minutes = 5 }: { minutes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, minutes * 60_000);
    return () => clearInterval(id);
  }, [router, minutes]);
  return null;
}

export interface Snapshot {
  open: number;
  overdue: number;
  dueSoon: number;
  inbox: number;
}

interface Stored {
  /** What the numbers were when the previous visit ended: what "since" compares against. */
  baseline: { at: string; values: Snapshot } | null;
  /** The numbers at the latest load. */
  last: { at: string; values: Snapshot };
}

/** A visit ends after this long without the dashboard being loaded. */
const VISIT_GAP_MS = 30 * 60_000;

const LABELS: { key: keyof Snapshot; one: string; many: string }[] = [
  { key: "open", one: "open case", many: "open cases" },
  { key: "overdue", one: "overdue", many: "overdue" },
  { key: "dueSoon", one: "due within 5 days", many: "due within 5 days" },
  { key: "inbox", one: "inbox message waiting", many: "inbox messages waiting" },
];

/**
 * "What changed since I last looked?" The previous numbers are kept in this browser only
 * (nothing is stored on the server about who looked when), one record per client filter.
 */
export function SinceLastVisit({ scope, now, values }: { scope: string; now: string; values: Snapshot }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const key = `pd:dashboard:${scope || "all"}`;
    let stored: Stored | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? "null") as Stored | null;
    } catch {
      stored = null;
    }
    const gap = stored ? Date.parse(now) - Date.parse(stored.last.at) : 0;
    const baseline = stored ? (gap > VISIT_GAP_MS ? stored.last : stored.baseline) : null;
    try {
      localStorage.setItem(key, JSON.stringify({ baseline, last: { at: now, values } } satisfies Stored));
    } catch {
      // Private browsing or a full store: the line simply does not show.
    }
    let line: string | null = null;
    if (baseline) {
      const changes = LABELS.map(({ key: k, one, many }) => {
        const d = values[k] - baseline.values[k];
        if (d === 0) return null;
        const n = Math.abs(d);
        return `${n} ${d > 0 ? "more" : "fewer"} ${n === 1 ? one : many}`;
      }).filter(Boolean);
      const when = new Date(baseline.at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      line = changes.length ? `Since your last visit (${when}): ${changes.join(", ")}.` : `Nothing has changed since your last visit (${when}).`;
    }
    // Read after the page has loaded, so the server's HTML and the first paint agree.
    const id = setTimeout(() => setText(line), 0);
    return () => clearTimeout(id);
  }, [scope, now, values]);

  if (!text) return null;
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {text}
    </p>
  );
}
