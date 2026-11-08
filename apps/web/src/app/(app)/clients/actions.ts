"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Region } from "@/lib/db/types";
import { REGIONS } from "@/lib/db/types";
import type { ClientFormState, ClientFormValues } from "./form-state";

function parse(formData: FormData): ClientFormState {
  const values: ClientFormValues = {
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    colour: String(formData.get("colour") ?? "").trim().toLowerCase(),
    region: String(formData.get("region") ?? "") as Region,
    internal_target_days: Number(formData.get("internal_target_days")),
    retention_months: Number(formData.get("retention_months")),
    ai_enabled: formData.get("ai_enabled") === "on",
    form_enabled: formData.get("form_enabled") === "on",
    contact_email: String(formData.get("contact_email") ?? "").trim().toLowerCase(),
  };
  const errors: ClientFormState["errors"] = {};

  if (values.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)) {
    errors.contact_email = "Enter an email address, or leave it empty.";
  }

  if (values.name.length < 2 || values.name.length > 200) {
    errors.name = "Enter the organisation's name, 2 to 200 characters.";
  }
  if (!/^[A-Z0-9]{2,6}$/.test(values.code)) {
    errors.code = "Use 2 to 6 letters or digits, for example ACME or NHS12. It appears in case references.";
  }
  if (!/^#[0-9a-f]{6}$/.test(values.colour)) {
    errors.colour = "Pick a colour.";
  }
  if (!REGIONS.some((r) => r.value === values.region)) {
    errors.region = "Choose the region whose bank holidays apply.";
  }
  if (!Number.isInteger(values.internal_target_days) || values.internal_target_days < 1 || values.internal_target_days > 90) {
    errors.internal_target_days = "Enter a whole number of days from 1 to 90.";
  }
  if (!Number.isInteger(values.retention_months) || values.retention_months < 6 || values.retention_months > 120) {
    errors.retention_months = "Enter a whole number of months from 6 to 120.";
  }
  return { values, errors };
}

/** The row to write: an empty contact email is stored as null. */
function toRow(values: ClientFormValues) {
  return { ...values, contact_email: values.contact_email || null };
}

function describe(code: string | undefined, message: string): ClientFormState["errors"] {
  switch (code) {
    case "23505":
      // Codes are unique across every consultancy, because /r/<code> is the client's public form.
      return { code: "This code is already in use. Choose a different one." };
    case "42501":
      return { form: "Only a partner administrator can add or change clients." };
    case "23514":
      return { form: "One of the values is outside the range the database allows." };
    default:
      return { form: `The change was not saved: ${message}` };
  }
}

export async function addClient(_prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const state = parse(formData);
  if (Object.keys(state.errors).length) return state;

  const supabase = await createClient();
  const { data: member } = await supabase.from("members").select("partner_id").limit(1).maybeSingle();
  if (!member) return { ...state, errors: { form: "You are not in a consultancy yet." } };

  const { data, error } = await supabase
    .from("organisations")
    .insert({ ...toRow(state.values), partner_id: member.partner_id })
    .select("id")
    .single();

  if (error) return { ...state, errors: describe(error.code, error.message) };
  revalidatePath("/clients");
  redirect(`/clients/${data.id}?saved=added`);
}

export async function updateClient(id: string, _prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const state = parse(formData);
  if (Object.keys(state.errors).length) return state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organisations")
    .update(toRow(state.values))
    .eq("id", id)
    .select("id");

  if (error) return { ...state, errors: describe(error.code, error.message) };
  // Row-level security returns zero rows, not an error, when the user may not update.
  if (!data?.length) return { ...state, errors: { form: "Only a partner administrator can change clients." } };
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?saved=changed`);
}
