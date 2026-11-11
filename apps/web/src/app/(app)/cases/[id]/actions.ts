"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  if (!ACTIONS.includes(action)) return { error: "Unknown action.", values };
  if (action !== "note" && !ISO_DATE.test(values.on)) return { error: "Enter the date this happened.", values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_case_action", {
    p_case_id: caseId,
    p_action: action,
    p_on: action === "note" ? todayInLondon() : values.on,
    p_note: values.note || null,
    p_outcome: values.outcome || null,
  });

  if (error) {
    // The function's messages already say what went wrong and how to fix it.
    const message = error.code === "42501" ? "You can read this case but not change it." : error.message;
    return { error: message, values };
  }
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
  redirect(`/cases/${caseId}`);
}
