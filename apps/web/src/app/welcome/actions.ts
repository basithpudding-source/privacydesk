"use server";

import { redirect } from "next/navigation";
import { REGIONS } from "@/lib/db/types";
import { DESK_KINDS, type DeskKind } from "@/lib/desk";
import { createClient } from "@/lib/supabase/server";

export interface SetupState {
  values: { kind: string; name: string; code: string; region: string };
  /** Field name to message; "form" is for a refusal not tied to one field. */
  errors: Partial<Record<"kind" | "name" | "code" | "region" | "form", string>>;
}

/**
 * Set up a desk for the person who has just signed in, and make them its administrator. An
 * organisation's own desk is made together with the organisation; a consultancy adds its
 * clients afterwards.
 */
export async function createDesk(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const values = {
    kind: String(formData.get("kind") ?? ""),
    name: String(formData.get("name") ?? "").trim().replace(/\s+/g, " "),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    region: String(formData.get("region") ?? "england-and-wales"),
  };
  const errors: SetupState["errors"] = {};
  const kind = (DESK_KINDS as readonly string[]).includes(values.kind) ? (values.kind as DeskKind) : null;
  if (!kind) errors.kind = "Choose who the desk is for.";
  if (values.name.length < 2 || values.name.length > 120) errors.name = "Enter a name of 2 to 120 characters.";
  if (kind === "organisation") {
    if (!/^[A-Z0-9]{2,6}$/.test(values.code)) errors.code = "Use 2 to 6 letters or digits, for example ACME.";
    if (!REGIONS.some((r) => r.value === values.region)) errors.region = "Choose the region whose bank holidays apply.";
  }
  if (!kind || Object.keys(errors).length) return { values, errors };

  const supabase = await createClient();
  let { error } = await supabase.rpc("create_workspace", {
    p_name: values.name,
    p_kind: kind,
    ...(kind === "organisation" ? { p_code: values.code, p_region: values.region } : {}),
  });
  // Before migration 0022 only a consultancy's desk can be made, by the older function.
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    if (kind === "organisation") {
      return { values, errors: { form: "The database needs migration 0022 before an organisation's own desk can be set up." } };
    }
    ({ error } = await supabase.rpc("create_partner", { p_name: values.name }));
  }

  if (error) {
    if (error.code === "23505" && error.hint === "code_taken") return { values, errors: { code: "That short code is already in use. Choose another." } };
    // Any other unique violation: this person already belongs to a desk.
    if (error.code === "23505") redirect("/start");
    if (error.code === "23514" && error.hint === "code") return { values, errors: { code: "Use 2 to 6 letters or digits, for example ACME." } };
    return { values, errors: { form: `The desk could not be set up: ${error.message}. Try again.` } };
  }
  redirect(kind === "organisation" ? "/organisation?saved=set-up" : "/clients");
}

/** Join the desk an administrator has added this person to. */
export async function joinDesk(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_id: id });
  if (error) {
    // 23505: already in a desk. P0002: withdrawn in the meantime.
    if (error.code === "23505") redirect("/start");
    redirect(error.code === "P0002" ? "/welcome?error=gone" : "/welcome?error=join");
  }
  redirect("/start");
}
