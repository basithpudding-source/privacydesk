"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { triage } from "@/lib/ai/triage";
import { CASE_TYPES } from "@/lib/cases/labels";
import { createClient } from "@/lib/supabase/server";

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
  const today = new Date().toISOString().slice(0, 10);

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
    receivedOn: String(item.received_at).slice(0, 10),
    aiEnabled: Boolean(org?.ai_enabled),
  });
  const { error } = await supabase.from("inbox_items").update({ triage: { ...outcome.result, fallbackReason: outcome.fallbackReason } }).eq("id", itemId);
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

  const outcome = await triage({ text: body, organisationName: org.name as string, receivedOn: new Date().toISOString().slice(0, 10), aiEnabled: Boolean(org.ai_enabled) });
  const { data, error } = await supabase
    .from("inbox_items")
    .insert({
      organisation_id: organisationId,
      channel: "paste",
      from_name: fromName || null,
      from_email: fromEmail ? fromEmail.toLowerCase() : null,
      subject: subject || null,
      body,
      triage: { ...outcome.result, fallbackReason: outcome.fallbackReason },
    })
    .select("id")
    .single();
  if (error) return { error: describe(error.code, error.message) };
  revalidatePath("/inbox");
  redirect(`/inbox?item=${data.id as string}`);
}
