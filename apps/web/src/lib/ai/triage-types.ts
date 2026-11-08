// What triage produces, whoever produced it. Stored as JSON on inbox items and cases.
import { z } from "zod";

export const TRIAGE_TYPES = ["complaint", "sar", "erasure", "rectification", "objection", "not_dp"] as const;
export type TriageType = (typeof TRIAGE_TYPES)[number];

/** The shape the model must return. Kept small so the result is easy to check by eye. */
export const TriageOutput = z.object({
  type: z.enum(TRIAGE_TYPES),
  also: z.array(z.enum(TRIAGE_TYPES)),
  confidence: z.number(),
  summary: z.string(),
  requesterName: z.string().nullable(),
  requesterEmail: z.string().nullable(),
  reasons: z.array(z.string()),
  idCheckSuggested: z.boolean(),
  clarificationSuggested: z.boolean(),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

export interface TriageResult extends TriageOutput {
  /** Who produced it: the model, the keyword check, or nobody. */
  by: "ai" | "keywords";
  model?: string;
  at: string;
}

/** Clamp and trim whatever came back, so a bad answer cannot break the screen. */
export function cleanTriage(r: Partial<TriageOutput>, by: TriageResult["by"], model?: string): TriageResult {
  const type = TRIAGE_TYPES.includes(r.type as TriageType) ? (r.type as TriageType) : "not_dp";
  return {
    by,
    model,
    at: new Date().toISOString(),
    type,
    also: Array.isArray(r.also) ? r.also.filter((x): x is TriageType => TRIAGE_TYPES.includes(x) && x !== type) : [],
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
    summary: String(r.summary ?? "").slice(0, 300),
    requesterName: r.requesterName ? String(r.requesterName).slice(0, 120) : null,
    requesterEmail: r.requesterEmail ? String(r.requesterEmail).slice(0, 160).toLowerCase() : null,
    reasons: Array.isArray(r.reasons) ? r.reasons.slice(0, 5).map((x) => String(x).slice(0, 160)) : [],
    idCheckSuggested: Boolean(r.idCheckSuggested),
    clarificationSuggested: Boolean(r.clarificationSuggested),
  };
}
