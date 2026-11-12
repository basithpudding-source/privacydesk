"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { triage } from "@/lib/ai/triage";
import { CASE_TYPES } from "@/lib/cases/labels";
import { createClient } from "@/lib/supabase/server";
import { londonDate, todayInLondon } from "@/lib/today";

export interface InboxActionState {
  error: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function describe(code: string | undefined, message: string) {
  if (code === "42501") return "You can read this inbox but not decide items.";
  return message;
}

/** Accept: create the case from the fields the person confirmed. */
export async function acceptItem(itemId: string, _prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  const type = String(formData.get("type") ?? "");
  const receivedOn = String(formData.get("received_on") ?? "");
  const requesterName = String(formData.get("requester_name") ?? "").trim();
  const requesterEmail = String(formData.get("requester_email") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const idRequired = formData.get("id_required") === "on";
  const today = todayInLondon();

  if (!CASE_TYPES.some((t) => t.value === type)) return { error: "Choose the type of request. If it is not about personal data, decline it instead." };
  if (!ISO_DATE.test(receivedOn) || receivedOn > today) return { error: "Enter the date received; it cannot be in the future." };
  if (requesterEmail && !EMAIL.test(requesterEmail)) return { error: "That does not look like an email address." };
  if (type === "complaint" && idRequired) return { error: "Complaints do not need proof of identity." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_inbox_item", {
    p_item_id: itemId,
    p_type: type,
    p_received_on: receivedOn,
    p_requester_name: requesterName || null,
    p_requester_email: requesterEmail || null,
    p_summary: summary || null,
    p_id_required: idRequired,
  });
  if (error) return { error: describe(error.code, error.message) };
  revalidatePath("/inbox");
  revalidatePath("/cases");
  redirect(`/cases/${data as string}`);
}

export async function declineItem(itemId: string, _prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it is being declined, for the record." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_inbox_item", { p_item_id: itemId, p_reason: reason });
  if (error) return { error: describe(error.code, error.message) };
  revalidatePath("/inbox");
  redirect("/inbox");
}

/** Run triage again (for example after the AI key was added) and store the new proposal. */
export async function retriageItem(itemId: string): Promise<InboxActionState> {
  const supabase = await createClient();
  const { data: item } = await supabase.from("inbox_items").select("id, body, organisation_id, received_at, status").eq("id", itemId).maybeSingle();
  if (!item || item.status !== "new") return { error: "This item is no longer new." };
  const { data: org } = await supabase.from("organisations").select("name, ai_enabled").eq("id", item.organisation_id).single();
  const outcome = await triage({
    text: item.body as string,
    organisationName: (org?.name as string) ?? "",
    receivedOn: londonDate(String(item.received_at)),
    aiEnabled: Boolean(org?.ai_enabled),
  });
  const { error } = await supabase.rpc("retriage_inbox_item", { p_item_id: itemId, p_triage: { ...outcome.result, fallbackReason: outcome.fallbackReason } });
  if (error) return { error: describe(error.code, error.message) };
  revalidatePath("/inbox");
  return { error: null };
}

/** Paste an email by hand: creates the item, triages it, opens it. */
export async function pasteItem(_prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  const organisationId = String(formData.get("organisation_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const fromName = String(formData.get("from_name") ?? "").trim();
  const fromEmail = String(formData.get("from_email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!organisationId) return { error: "Choose the client the message was sent to." };
  if (body.length < 10) return { error: "Paste the message first; it needs at least a sentence." };
  if (body.length > 20000) return { error: "That message is too long. Paste the relevant part." };
  if (fromEmail && !EMAIL.test(fromEmail)) return { error: "That does not look like an email address." };

  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("name, ai_enabled").eq("id", organisationId).maybeSingle();
  if (!org) return { error: "Choose one of your clients." };

  const outcome = await triage({ text: body, organisationName: org.name as string, receivedOn: todayInLondon(), aiEnabled: Boolean(org.ai_enabled) });
  // The database function checks the membership and writes the row; there is no direct insert.
  const { data, error } = await supabase.rpc("add_inbox_item", {
    p_organisation_id: organisationId,
    p_body: body,
    p_from_name: fromName || null,
    p_from_email: fromEmail || null,
    p_subject: subject || null,
    p_triage: { ...outcome.result, fallbackReason: outcome.fallbackReason },
  });
  if (error) return { error: describe(error.code, error.message) };
  revalidatePath("/inbox");
  redirect(`/inbox?item=${data as string}`);
}

export interface ImportItem {
  organisationId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  /** When the email arrived (ISO), or null to use now. */
  receivedAt: string | null;
  messageId: string;
}

export interface ImportResult {
  status: "imported" | "duplicate" | "error";
  message?: string;
}

/** The most emails one import takes, so a slip of the hand cannot flood the inbox. */
const IMPORT_LIMIT = 25;

/**
 * Import saved emails that were read in the browser: each becomes an inbox item, triaged,
 * with the date the email actually arrived, because the clock runs from that day. The same
 * email imported twice is stored once. Nothing becomes a case until a person accepts it.
 */
export async function importEmails(items: ImportItem[]): Promise<{ error: string | null; results: ImportResult[] }> {
  if (!Array.isArray(items) || items.length === 0) return { error: "Add at least one email first.", results: [] };
  if (items.length > IMPORT_LIMIT) return { error: `Import at most ${IMPORT_LIMIT} emails at a time.`, results: [] };

  const supabase = await createClient();
  const { data: orgRows } = await supabase.from("organisations").select("id, name, ai_enabled");
  const orgs = new Map((orgRows ?? []).map((o) => [o.id as string, o]));
  const now = Date.now();

  async function one(item: ImportItem): Promise<ImportResult> {
    const org = orgs.get(String(item.organisationId));
    if (!org) return { status: "error", message: "Choose one of your clients." };
    const body = String(item.body ?? "").trim();
    if (body.length < 10) return { status: "error", message: "No text was found in this email." };
    if (body.length > 50000) return { status: "error", message: "The text is too long." };
    const fromEmail = String(item.fromEmail ?? "").trim();
    if (fromEmail && !EMAIL.test(fromEmail)) return { status: "error", message: "The sender is not an email address." };
    const at = item.receivedAt ? new Date(item.receivedAt) : null;
    if (at && Number.isNaN(at.getTime())) return { status: "error", message: "The date of this email could not be read." };
    // A date ahead of now is a wrong clock on the sender's side; the item is dated now instead.
    const receivedAt = at && at.getTime() <= now ? at.toISOString() : null;

    const outcome = await triage({
      text: body.slice(0, 20000),
      organisationName: org.name as string,
      receivedOn: receivedAt ? londonDate(receivedAt) : todayInLondon(),
      aiEnabled: Boolean(org.ai_enabled),
    });
    const { data, error } = await supabase.rpc("add_inbox_item", {
      p_organisation_id: org.id,
      p_body: body,
      p_from_name: String(item.fromName ?? "").trim() || null,
      p_from_email: fromEmail || null,
      p_subject: String(item.subject ?? "").trim() || null,
      p_triage: { ...outcome.result, fallbackReason: outcome.fallbackReason },
      p_received_at: receivedAt,
      p_message_id: String(item.messageId ?? "").trim().slice(0, 500) || null,
      p_channel: "email",
    });
    if (error) {
      // PGRST202: the database does not have the three extra values yet (migration 0018).
      if (error.code === "PGRST202") return { status: "error", message: "The database needs migration 0018 before emails can be imported." };
      return { status: "error", message: describe(error.code, error.message) };
    }
    return data ? { status: "imported" } : { status: "duplicate" };
  }

  // A few at a time: each one may wait on a triage call.
  const results: ImportResult[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = await one(items[i]);
        } catch {
          results[i] = { status: "error", message: "Something went wrong; try this one again." };
        }
      }
    }),
  );
  revalidatePath("/inbox");
  return { error: null, results };
}

/** PGRST202: the undo functions arrive with migration 0019. */
function describeUndo(code: string | undefined, message: string) {
  if (code === "PGRST202") return "The database needs migration 0019 before this can be undone.";
  return describe(code, message);
}

/**
 * Undo a decline: the message goes back to the inbox to be triaged and decided again. The
 * reason is required, and the decline and its undoing both stay on the message's log.
 */
export async function reopenItem(itemId: string, _prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it is going back to the inbox." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_inbox_item", { p_item_id: itemId, p_reason: reason.slice(0, 500) });
  if (error) return { error: describeUndo(error.code, error.message) };
  revalidatePath("/inbox");
  redirect(`/inbox?item=${itemId}`);
}

/**
 * Undo an accept: the case is closed and marked as returned (never deleted), and the message
 * it came from goes back to the inbox. Works from the case page and from the inbox.
 */
export async function returnCaseToInbox(caseId: string, _prev: InboxActionState, formData: FormData): Promise<InboxActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the case is going back to the inbox." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("return_case_to_inbox", { p_case_id: caseId, p_reason: reason.slice(0, 500) });
  if (error) return { error: describeUndo(error.code, error.message) };
  revalidatePath("/inbox");
  revalidatePath("/cases");
  redirect(`/inbox?item=${data as string}`);
}
