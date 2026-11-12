import type { CaseEventRow } from "@/lib/cases/types";
import { shortDate } from "@/lib/clocks";
import { londonDate } from "@/lib/today";

/** Newest first. Events are never edited or deleted, so this is the record. */
export function AuditTrail({ events, currentUserId }: { events: CaseEventRow[]; currentUserId: string }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:inset-y-1.5 before:left-[3px] before:w-px before:bg-border">
      {events.map((e) => (
        <li key={e.id} className="relative pl-5 text-sm">
          <span className="absolute left-0 top-1.5 size-[7px] rounded-full bg-muted-foreground/60 ring-4 ring-card" aria-hidden="true" />
          <p>{e.text}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <time dateTime={e.at} className="tabular-nums" title={new Date(e.at).toLocaleString("en-GB")}>
              {shortDate(londonDate(e.at))}
            </time>{" "}
            · {who(e.actor, currentUserId)}
          </p>
        </li>
      ))}
    </ol>
  );
}

// No display names yet (open question in docs/DECISIONS.md), so: you, or a short id.
function who(actor: string | null, me: string) {
  if (!actor) return "system";
  if (actor === me) return "you";
  return `user ${actor.slice(0, 8)}`;
}
