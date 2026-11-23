import { Mail } from "lucide-react";
import type { CaseEventRow } from "@/lib/cases/types";
import { shortDate } from "@/lib/clocks";
import { whoDid, type People } from "@/lib/people";
import { londonDate } from "@/lib/today";

/** Newest first. Events are never edited or deleted, so this is the record. */
export function AuditTrail({ events, currentUserId, people }: { events: CaseEventRow[]; currentUserId: string; /** The desk's directory, to name whoever made each entry. */ people: People }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:inset-y-1.5 before:left-[3px] before:w-px before:bg-border">
      {events.map((e) => (
        <li key={e.id} className="relative pl-5 text-sm">
          <span className="absolute left-0 top-1.5 size-[7px] rounded-full bg-muted-foreground/60 ring-4 ring-card" aria-hidden="true" />
          <p>{stepOf(e.text)}</p>
          {evidenceOf(e.text) && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
              <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{evidenceOf(e.text)}</span>
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            <time dateTime={e.at} className="tabular-nums" title={new Date(e.at).toLocaleString("en-GB")}>
              {shortDate(londonDate(e.at))}
            </time>{" "}
            · {whoDid(e.actor, currentUserId, people)}
          </p>
        </li>
      ))}
    </ol>
  );
}

// An entry may end with the short record of the email that was sent (migration 0021).
const EVIDENCE = ". Email evidence: ";
const stepOf = (text: string) => (text.includes(EVIDENCE) ? `${text.slice(0, text.indexOf(EVIDENCE))}.` : text);
const evidenceOf = (text: string) => (text.includes(EVIDENCE) ? `Email evidence: ${text.slice(text.indexOf(EVIDENCE) + EVIDENCE.length)}` : null);
