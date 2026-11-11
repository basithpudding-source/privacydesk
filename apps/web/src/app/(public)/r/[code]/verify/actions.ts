"use server";

import { triage } from "@/lib/ai/triage";
import type { Region } from "@/lib/clocks";
import { sendEmail } from "@/lib/email/send";
import { confirmationEmail, requestKindLabel, responseDates, type RequestKind } from "@/lib/public-form/copy";
import { formServerKey, hashToken, looksLikeToken } from "@/lib/public-form/tokens";
import { createAnonClient } from "@/lib/supabase/anon";
import type { ConfirmState } from "./confirm-state";

interface Verified {
  ref: string;
  received_on: string;
  request_type: RequestKind;
  requester_name: string;
  requester_email: string;
  details: string;
  organisation_name: string;
  colour: string;
  region: Region;
  contact_email: string | null;
  ai_enabled: boolean;
  inbox_item_id: string;
  already_verified: boolean;
}

const problem = (title: string, message: string): ConfirmState => ({ status: "problem", title, message });

/**
 * The person pressed the button on the page the emailed link opens. Only now is the
 * submission marked verified, put in the consultancy's inbox, triaged and confirmed by email,
 * and only now does the clock start. Opening the link does none of this: mail scanners and
 * link previews open links, but they do not press buttons. Pressing again changes nothing and
 * shows the same confirmation.
 */
export async function confirmRequest(code: string, token: string): Promise<ConfirmState> {
  if (!looksLikeToken(token)) return problem("This link is not complete", "Open the link from the email again, or copy it whole into the address bar.");

  const serverKey = formServerKey();
  const supabase = createAnonClient();
  const tokenHash = hashToken(token);
  const { data, error } = await supabase.rpc("form_verify", { p_code: code, p_token_hash: tokenHash, p_server_key: serverKey ?? "" });
  if (error) {
    if (error.code === "22023") return problem("This link has expired", "Links work for 24 hours. Fill in the form again and we will send a new one.");
    if (error.code === "P0002") return problem("This link is not recognised", "Check that you opened the most recent email, or fill in the form again.");
    if (error.code === "42501") console.error("[public form] The database refused FORM_SERVER_KEY; see apps/web/README.md.");
    return problem("Something went wrong", "We could not confirm your request. Try again in a minute.");
  }
  const v = ((data as Verified[] | null) ?? [])[0];
  if (!v) return problem("This link is not recognised", "Fill in the form again and we will send a new one.");

  // Bank holidays for the client's region, so the response date is worked out as the case page will.
  const { data: holidayRows } = await supabase.from("bank_holidays").select("day").eq("region", v.region);
  const holidays = new Set((holidayRows ?? []).map((h) => h.day as string));

  if (!v.already_verified) {
    // Triage now, so the item is already proposed when the consultancy opens the inbox.
    const outcome = await triage({ text: v.details, organisationName: v.organisation_name, receivedOn: v.received_on, aiEnabled: v.ai_enabled });
    await supabase.rpc("form_set_triage", { p_token_hash: tokenHash, p_triage: { ...outcome.result, fallbackReason: outcome.fallbackReason }, p_server_key: serverKey ?? "" });
    const message = confirmationEmail({
      ref: v.ref,
      kind: v.request_type,
      receivedOn: v.received_on,
      region: v.region,
      organisationName: v.organisation_name,
      requesterName: v.requester_name,
      contactEmail: v.contact_email,
      holidays,
    });
    await sendEmail({ to: v.requester_email, subject: message.subject, text: message.text });
  }

  return {
    status: "done",
    already: v.already_verified,
    ref: v.ref,
    receivedOn: v.received_on,
    kindLabel: requestKindLabel(v.request_type),
    sentence: responseDates(v.request_type, v.received_on, v.region, holidays).sentence,
    organisationName: v.organisation_name,
    contactEmail: v.contact_email,
  };
}
