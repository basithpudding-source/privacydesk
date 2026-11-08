import type { TriageResult } from "@/lib/ai/triage-types";

export interface InboxItemRow {
  id: string;
  organisation_id: string;
  received_at: string;
  channel: "email" | "paste" | "form";
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  body: string;
  message_id: string | null;
  status: "new" | "accepted" | "declined";
  triage: TriageResult | null;
  case_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decline_reason: string | null;
}

export interface InboxListRow extends InboxItemRow {
  organisation_name: string;
  organisation_code: string;
  organisation_colour: string;
  case_ref: string | null;
}
