"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
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
      return { form: "Only an administrator can change these settings." };
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
  if (!member) return { ...state, errors: { form: "You are not in a desk yet." } };

  const { data, error } = await supabase
    .from("organisations")
    .insert({ ...toRow(state.values), partner_id: member.partner_id })
    .select("id")
    .single();

  if (error) return { ...state, errors: describe(error.code, error.message) };
  revalidatePath("/clients");
  redirect(`/clients/${data.id}?saved=added`);
}

/** `back` is "/organisation" when an organisation is changing its own settings; otherwise the client's page. */
export async function updateClient(id: string, back: string | null, _prev: ClientFormState, formData: FormData): Promise<ClientFormState> {
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
  if (!data?.length) return { ...state, errors: { form: "Only an administrator can change these settings." } };
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/organisation");
  // Only the one known address is honoured; anything else goes to the client's page.
  redirect(back === "/organisation" ? "/organisation?saved=changed" : `/clients/${id}?saved=changed`);
}

export interface DeleteClientState {
  error: string | null;
}

/**
 * Delete one client and everything held for it (migration 0024). The database checks that
 * the person is an administrator, that the name typed is the client's, and that a reason was
 * given; it writes what was deleted to the team log, and only then deletes. Nothing here can
 * be undone, so nothing here is decided by the app: it only passes on what was typed.
 */
export async function deleteClient(id: string, _prev: DeleteClientState, formData: FormData): Promise<DeleteClientState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_client", {
    p_org: id,
    p_name: String(formData.get("confirm_name") ?? ""),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { error: "The database needs migration 0024 before a client can be deleted." };
    if (error.code === "42501") return { error: "Only an administrator who has entered their authenticator code can delete a client." };
    if (error.hint === "name") return { error: "The name typed does not match the client's name exactly." };
    if (error.hint === "reason") return { error: "Say who asked for this and why, in 5 to 500 characters." };
    if (error.hint === "own") return { error: "An organisation's own desk cannot delete its organisation. Ask for the desk to be closed instead." };
    return { error: "The client was not deleted. Nothing has been removed. Try again in a minute." };
  }
  revalidatePath("/clients");
  revalidatePath("/cases");
  revalidatePath("/inbox");
  redirect("/clients?deleted=1");
}
