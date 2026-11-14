"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { summariseSentEmail, type SentSummaryOutcome } from "@/lib/ai/sent-summary";
import { requireMember } from "@/lib/auth";
import { EMAIL_STEPS } from "@/lib/cases/evidence";
import type { SentRecord } from "@/lib/mailbox/pending";
import { ACTIONS, type CaseAction } from "@/lib/cases/types";
import { createClient } from "@/lib/supabase/server";
import { todayInLondon } from "@/lib/today";

export interface ActionState {
  error: string | null;
  values: { on: string; note: string; outcome: string };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function applyCaseAction(caseId: string, action: CaseAction, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = {
    on: String(formData.get("on") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim(),
    outcome: String(formData.get("outcome") ?? "").trim(),
  };
  // The short record of a sent email (lib/cases/evidence.ts), only on steps where one is sent.
  const evidence = EMAIL_STEPS.includes(action) ? String(formData.get("evidence") ?? "").replace(/\s+/g, " ").trim().slice(0, 1500) : "";
  if (!ACTIONS.includes(action)) return { error: "Unknown action.", values };
  if (action !== "note" && !ISO_DATE.test(values.on)) return { error: "Enter the date this happened.", values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_case_action", {
    p_case_id: caseId,
    p_action: action,
    p_on: action === "note" ? todayInLondon() : values.on,
    p_note: values.note || null,
    p_outcome: values.outcome || null,
    // Left out entirely when there is none, so the step still works on a database that has
    // not had migration 0021.
    ...(evidence ? { p_evidence: evidence } : {}),
  });

  if (error) {
    // The function's messages already say what went wrong and how to fix it.
    const message =
      error.code === "42501"
        ? "You can read this case but not change it."
        : error.code === "PGRST202" && evidence
          ? "The database needs migration 0021 before an email can be recorded with a step. Remove the email to record the step without it."
          : error.message;
    return { error: message, values };
  }
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
  redirect(`/cases/${caseId}`);
}

/**
 * A one-line summary of a sent email, for the evidence kept with a step. The text arrives
 * from the browser, where the email was read; nothing else of the email reaches the server.
 * AI is used only when the client's AI switch is on; otherwise the caller keeps its own
 * plain summary. The person sees and can change the summary before it is recorded.
 */
export async function summariseSent(caseId: string, text: string): Promise<SentSummaryOutcome> {
  const user = await requireMember();
  if (user.membership.role === "read_only") return { summary: null, reason: "You can read this case but not change it." };
  const supabase = await createClient();
  // Through the person's own session, so row-level security decides whether the case is theirs.
  const { data: c } = await supabase.from("cases").select("organisation_id").eq("id", caseId).maybeSingle();
  if (!c) return { summary: null, reason: "That case is not here." };
  const { data: org } = await supabase.from("organisations").select("name, ai_enabled").eq("id", c.organisation_id).maybeSingle();
  if (!org) return { summary: null, reason: "That case is not here." };
  return summariseSentEmail({ text: String(text ?? "").slice(0, 20000), organisationName: org.name as string, aiEnabled: Boolean(org.ai_enabled) });
}

/**
 * Record on the case that a reply was sent from the person's own mailbox. The browser sends
 * the email itself (the server never sees the mailbox); this only writes what the audit trail
 * keeps: the step, the day, and the short record of the email. It is called once the mailbox
 * has accepted the email, never before, and it goes through the same audited database
 * function as recording the step by hand.
 */
export async function recordSentLetter(caseId: string, r: SentRecord): Promise<{ error: string | null }> {
  const user = await requireMember();
  if (user.membership.role === "read_only") return { error: "You can read this case but not change it." };
  const today = todayInLondon();
  const on = ISO_DATE.test(r.on) && r.on <= today ? r.on : today;
  const step = r.action && EMAIL_STEPS.includes(r.action) ? r.action : null;
  const tidy = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "record_case_action",
    step
      ? { p_case_id: caseId, p_action: step, p_on: on, p_note: tidy(r.note, 2000) || null, p_outcome: tidy(r.outcome, 300) || null, p_evidence: tidy(r.evidence, 1500) || null }
      : // No step of this kind is open on the case, so the email is kept as a note.
        { p_case_id: caseId, p_action: "note", p_on: today, p_note: tidy(r.fallbackNote, 2000) },
  );
  if (error) return { error: error.code === "42501" ? "You can read this case but not change it." : error.message };
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
  return { error: null };
}
