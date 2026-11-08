// Row shapes for cases, their pauses, events and the deadlines view (supabase/migrations).
import type { CaseType } from "@/lib/clocks";
import type { ClockState } from "./labels";

export interface CaseRow {
  id: string;
  organisation_id: string;
  ref: string;
  type: CaseType;
  status: "open" | "closed";
  channel: string;
  requester_name: string | null;
  requester_email: string | null;
  received_on: string;
  summary: string | null;
  message: string | null;
  id_required: boolean;
  id_received_on: string | null;
  extended: boolean;
  extended_on: string | null;
  acknowledged_on: string | null;
  closed_on: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClockPauseRow {
  id: string;
  case_id: string;
  paused_on: string;
  resumed_on: string | null;
  note: string | null;
}

export interface CaseEventRow {
  id: number;
  case_id: string;
  at: string;
  kind: string;
  text: string;
  actor: string | null;
}

export interface DeadlineRow {
  case_id: string;
  ref: string;
  organisation_id: string;
  type: CaseType;
  status: "open" | "closed";
  received_on: string;
  clock_state: ClockState;
  ack_due: string | null;
  response_due: string | null;
  internal_target: string | null;
  days_left: number | null;
  met_on_time: boolean | null;
}

/** One row of the case list: the deadlines view joined to the case and its client. */
export interface CaseListRow extends DeadlineRow {
  requester_name: string | null;
  summary: string | null;
  organisation_name: string;
  organisation_code: string;
  organisation_colour: string;
}

export const ACTIONS = [
  "acknowledge",
  "ask_id",
  "id_received",
  "pause",
  "resume",
  "extend",
  "note",
  "close",
  "reopen",
] as const;
export type CaseAction = (typeof ACTIONS)[number];
