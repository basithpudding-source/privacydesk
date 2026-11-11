import type { CaseEventRow } from "@/lib/cases/types";
import { shortDate } from "@/lib/clocks";
import { londonDate } from "@/lib/today";

/** Newest first. Events are never edited or deleted, so this is the record. */
export function AuditTrail({ events, currentUserId }: { events: CaseEventRow[]; currentUserId: string }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
          <time dateTime={e.at} className="tabular-nums text-muted-foreground" title={new Date(e.at).toLocaleString("en-GB")}>
            {shortDate(londonDate(e.at))}
          </time>
          <p>
            {e.text}
            <span className="text-muted-foreground"> · {who(e.actor, currentUserId)}</span>
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
