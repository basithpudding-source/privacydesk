// Reads for the public form, through the one function the anonymous role may call.
import "server-only";
import { createAnonClient } from "@/lib/supabase/anon";

export interface FormClient {
  name: string;
  code: string;
  colour: string;
  region: string;
  form_enabled: boolean;
  contact_email: string | null;
}

/** The client behind /r/<code>, or null. Only what the public page needs comes back. */
export async function lookupClient(code: string): Promise<FormClient | null> {
  if (!/^[A-Za-z0-9]{2,6}$/.test(code)) return null;
  const { data } = await createAnonClient().rpc("form_lookup", { p_code: code });
  return ((data as FormClient[] | null) ?? [])[0] ?? null;
}
