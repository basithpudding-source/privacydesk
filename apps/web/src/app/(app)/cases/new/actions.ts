"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CASE_TYPES } from "@/lib/cases/labels";
import { createClient } from "@/lib/supabase/server";
import type { NewCaseState } from "./form-state";
import { todayInLondon } from "@/lib/today";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function logCase(_prev: NewCaseState, formData: FormData): Promise<NewCaseState> {
  const values: NewCaseState["values"] = {
    organisation_id: String(formData.get("organisation_id") ?? ""),
    type: String(formData.get("type") ?? "sar"),
    channel: String(formData.get("channel") ?? "Email"),
    received_on: String(formData.get("received_on") ?? ""),
    requester_name: String(formData.get("requester_name") ?? "").trim(),
    requester_email: String(formData.get("requester_email") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim(),
    id_required: formData.get("id_required") === "on",
  };
  const errors: NewCaseState["errors"] = {};
  const today = todayInLondon();

  if (!values.organisation_id) errors.organisation_id = "Choose the client the request is about.";
  if (!CASE_TYPES.some((t) => t.value === values.type)) errors.type = "Choose the type of request.";
  if (!ISO_DATE.test(values.received_on)) errors.received_on = "Enter the date the request arrived.";
  else if (values.received_on > today) errors.received_on = "The date cannot be in the future.";
  if (values.requester_email && !EMAIL.test(values.requester_email)) errors.requester_email = "That does not look like an email address.";
  if (values.summary.length > 300) errors.summary = "Keep the summary under 300 characters.";
  if (values.type === "complaint" && values.id_required) errors.id_required = "Complaints do not need proof of identity.";
  if (Object.keys(errors).length) return { values, errors };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_case", {
    p_organisation_id: values.organisation_id,
    p_type: values.type,
    p_received_on: values.received_on,
    p_channel: values.channel,
    p_requester_name: values.requester_name || null,
    p_requester_email: values.requester_email || null,
    p_summary: values.summary || null,
    p_message: values.message || null,
    p_id_required: values.id_required,
  });

  if (error) {
    const form =
      error.code === "42501"
        ? "You can read this client's cases but not add to them."
        : `The case was not logged: ${error.message}`;
    return { values, errors: { form } };
  }
  revalidatePath("/cases");
  redirect(`/cases/${data as string}`);
}
