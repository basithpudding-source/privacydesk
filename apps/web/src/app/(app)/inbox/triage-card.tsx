import type { TriageResult } from "@/lib/ai/triage-types";
import { Tag } from "@/components/ui/tag";
import { typeLabel } from "@/lib/cases/labels";

type Stored = TriageResult & { fallbackReason?: string | null };

/** The triage result with quoted reasons and a confidence bar, kept from the prototype. */
export function TriageCard({ triage }: { triage: Stored | null }) {
  if (!triage) {
    return (
      <div className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
        Not triaged yet. Use “Run triage again” or read the message and decide.
      </div>
    );
  }
  const pct = Math.round(triage.confidence * 100);
  const label = triage.type === "not_dp" ? "Not about personal data" : typeLabel(triage.type);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="text-muted-foreground">{triage.by === "ai" ? "AI triage proposes" : "Keyword check suggests"}</span>{" "}
          <span className="font-semibold">{label}</span>
          {triage.also.length > 0 && (
            <span className="text-muted-foreground"> (also: {triage.also.map((t) => typeLabel(t, "short")).join(", ")})</span>
          )}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">{pct}% confident</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted" role="img" aria-label={`${pct} percent confident`}>
        <div className="h-full rounded bg-info" style={{ width: `${pct}%` }} />
      </div>
      {triage.summary && <p className="mt-3 text-sm">{triage.summary}</p>}
      {triage.reasons.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {triage.reasons.map((r, i) => (
            <li key={i} className="border-l-2 border-info/50 pl-2.5">“{r.replace(/^[“"]|[”"]$/g, "")}”</li>
          ))}
        </ul>
      )}
      {(triage.idCheckSuggested || triage.clarificationSuggested) && (
        <p className="mt-3 text-sm">
          {triage.idCheckSuggested && <Tag tone="warn" className="mr-2">ID check suggested</Tag>}
          {triage.clarificationSuggested && <Tag tone="warn">May need clarification</Tag>}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {triage.by === "ai" ? `Model: ${triage.model ?? "AI"}. ` : triage.fallbackReason ? `${triage.fallbackReason} ` : ""}
        A person decides; the AI only proposes.
      </p>
    </div>
  );
}
