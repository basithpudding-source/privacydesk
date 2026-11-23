// The download an administrator takes when a client (or an organisation's own desk) wants its
// data back: everything Privacy Desk holds for one organisation, in a file a person or another
// system can read. Nothing here talks to the database; app/api/export gathers the rows.

/** One value for a spreadsheet cell. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  // A cell that starts with one of these is run as a formula by spreadsheet programs. The text
  // came from members of the public, so it is made plain text with a leading apostrophe.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows as a spreadsheet file. The first bytes tell Excel the text is UTF-8, so names keep their accents. */
export function toCsv<T>(rows: T[], columns: { heading: string; value: (row: T) => unknown }[]): string {
  const lines = [columns.map((c) => csvCell(c.heading)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A file name a person will recognise in their downloads folder, with nothing a file system rejects. */
export function exportFileName(code: string, day: string, extension: "json" | "csv"): string {
  const safe = code.toLowerCase().replace(/[^a-z0-9]+/g, "") || "organisation";
  return `privacy-desk-${safe}-${extension === "csv" ? "cases" : "everything"}-${day}.${extension}`;
}

type Row = Record<string, unknown>;

export interface ExportParts {
  organisation: Row;
  cases: Row[];
  events: Row[];
  pauses: Row[];
  messages: Row[];
  messageEvents: Row[];
  madeAt: string;
  madeBy: string | null;
  /** Names for the people on the logs (lib/people.ts). */
  who: (actor: string | null) => string;
}

// Settings the organisation would recognise as its own; the secret half of its forwarding
// address is left out, because a copy of the file should not let anyone send mail in.
const ORGANISATION_FIELDS = ["name", "code", "region", "internal_target_days", "retention_months", "ai_enabled", "form_enabled", "contact_email", "created_at"];

function group(rows: Row[], key: string): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[key]);
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}

/** The whole export as one document: each case with its audit trail and pauses, each inbox message with its log. */
export function exportDocument(p: ExportParts): Row {
  const eventsByCase = group(p.events, "case_id");
  const pausesByCase = group(p.pauses, "case_id");
  const logByMessage = group(p.messageEvents, "inbox_item_id");
  const named = (e: Row) => ({ at: e.at, by: p.who((e.actor as string | null) ?? null), kind: e.kind, text: e.text });
  return {
    export: {
      of: p.organisation.name,
      made_at: p.madeAt,
      made_by: p.madeBy,
      from: "Privacy Desk",
      holds:
        "Everything Privacy Desk holds for this organisation: its settings, every case with its audit trail and clock pauses, and every inbox message with its log. Requests still waiting for a member of the public to confirm their email address are not included; they are deleted automatically if never confirmed.",
      counts: { cases: p.cases.length, audit_events: p.events.length, inbox_messages: p.messages.length },
    },
    organisation: Object.fromEntries(ORGANISATION_FIELDS.map((f) => [f, p.organisation[f] ?? null])),
    cases: p.cases.map((c) => ({
      ...c,
      audit_trail: (eventsByCase.get(String(c.id)) ?? []).map(named),
      clock_pauses: (pausesByCase.get(String(c.id)) ?? []).map((x) => ({ paused_on: x.paused_on, resumed_on: x.resumed_on })),
    })),
    inbox_messages: p.messages.map((m) => ({ ...m, log: (logByMessage.get(String(m.id)) ?? []).map(named) })),
  };
}

export interface CaseSheetRow {
  ref: string;
  type: string;
  status: string;
  received_on: string | null;
  channel: string | null;
  requester_name: string | null;
  requester_email: string | null;
  summary: string | null;
  acknowledged_on: string | null;
  ack_due: string | null;
  response_due: string | null;
  closed_on: string | null;
  outcome: string | null;
  met_on_time: boolean | null;
}

/** The cases alone, one row each, for someone who wants a spreadsheet rather than a data file. */
export function casesSheet(rows: CaseSheetRow[]): string {
  return toCsv(rows, [
    { heading: "Reference", value: (r) => r.ref },
    { heading: "Type", value: (r) => r.type },
    { heading: "Status", value: (r) => r.status },
    { heading: "Received", value: (r) => r.received_on },
    { heading: "How it arrived", value: (r) => r.channel },
    { heading: "From", value: (r) => r.requester_name },
    { heading: "Email", value: (r) => r.requester_email },
    { heading: "Summary", value: (r) => r.summary },
    { heading: "Acknowledged on", value: (r) => r.acknowledged_on },
    { heading: "Acknowledge by", value: (r) => r.ack_due },
    { heading: "Respond by", value: (r) => r.response_due },
    { heading: "Closed on", value: (r) => r.closed_on },
    { heading: "Outcome", value: (r) => r.outcome },
    { heading: "Met the legal deadline", value: (r) => r.met_on_time },
  ]);
}
