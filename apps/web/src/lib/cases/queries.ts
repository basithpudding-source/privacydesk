// Reads for the case screens. Every query goes through the user's own Supabase client, so
// row-level security decides what comes back; nothing here filters by partner itself.
import { bucketOf } from "@/lib/dashboard/live";
import "server-only";
import type { Holidays } from "@/lib/clocks";
import type { Organisation } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import type { ClockState } from "./labels";
import type { CaseEventRow, CaseListRow, CaseRow, ClockPauseRow, DeadlineRow } from "./types";

export type StatusFilter = "open" | "overdue" | "week" | "closed" | "all";

/** The columns the case list can be sorted by; "" keeps the default order (next deadline first, grouped). */
export const CASE_SORTS = ["ref", "status", "deadline", "from", "subject", "summary", "client", "type", "channel", "received", "target", "acknowledged"] as const;
export type CaseSort = (typeof CASE_SORTS)[number] | "";

/** A dashboard bucket the list can be narrowed to (see lib/dashboard/live.ts). */
export const SHOWS = ["today", "soon", "onTrack", "notRunning"] as const;
export type Show = (typeof SHOWS)[number] | "";

export interface CaseFilters {
  /** Only open cases in this dashboard bucket. */
  show: Show;
  /** Only open cases whose next deadline is this day (YYYY-MM-DD). */
  due: string;
  sort: CaseSort;
  dir: "asc" | "desc";
  status: StatusFilter;
  type: string;
  client: string;
  q: string;
}

export function parseFilters(params: Record<string, string | string[] | undefined>): CaseFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(params.status);
  return {
    status: (["open", "overdue", "week", "closed", "all"] as const).includes(status as StatusFilter)
      ? (status as StatusFilter)
      : "open",
    type: one(params.type),
    client: one(params.client),
    q: one(params.q).trim(),
    show: (SHOWS as readonly string[]).includes(one(params.show)) ? (one(params.show) as Show) : "",
    due: /^\d{4}-\d{2}-\d{2}$/.test(one(params.due)) ? one(params.due) : "",
    sort: (CASE_SORTS as readonly string[]).includes(one(params.sort)) ? (one(params.sort) as CaseSort) : "",
    dir: one(params.dir) === "desc" ? "desc" : "asc",
  };
}

/** Rows of the case list, sorted so the next legal deadline comes first. */
export async function listCases(filters: CaseFilters): Promise<{ rows: CaseListRow[]; error: string | null }> {
  const supabase = await createClient();
  let query = supabase
    .from("v_case_deadlines")
    .select("case_id, ref, organisation_id, type, status, received_on, clock_state, ack_due, response_due, internal_target, days_left, met_on_time")
    .limit(500);

  if (filters.status === "closed") query = query.eq("status", "closed");
  else if (filters.status !== "all") query = query.eq("status", "open");
  if (filters.status === "overdue") query = query.lt("days_left", 0);
  if (filters.status === "week") query = query.gte("days_left", 0).lte("days_left", 7);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.client) query = query.eq("organisation_id", filters.client);

  const { data: deadlines, error } = await query;
  if (error) return { rows: [], error: error.message };
  const dl = (deadlines ?? []) as DeadlineRow[];
  if (dl.length === 0) return { rows: [], error: null };

  const ids = dl.map((d) => d.case_id);
  const [{ data: cases }, { data: orgs }, { data: sources }] = await Promise.all([
    supabase.from("cases").select("id, requester_name, requester_email, summary, source_ref, channel, acknowledged_on").in("id", ids),
    supabase.from("organisations").select("id, name, code, colour"),
    // The message a case was made from stays in the inbox table for the life of the case,
    // and with it the subject line it arrived under. A case logged by hand has none.
    supabase.from("inbox_items").select("case_id, subject").in("case_id", ids),
  ]);
  const subjectByCase = new Map((sources ?? []).map((s) => [s.case_id as string, (s.subject as string | null) ?? null]));
  const caseById = new Map((cases ?? []).map((c) => [c.id as string, c]));
  const orgById = new Map((orgs ?? []).map((o) => [o.id as string, o]));

  let rows: CaseListRow[] = dl.map((d) => {
    const c = caseById.get(d.case_id);
    const o = orgById.get(d.organisation_id);
    return {
      ...d,
      requester_name: (c?.requester_name as string | null) ?? null,
      requester_email: (c?.requester_email as string | null) ?? null,
      channel: (c?.channel as string | null) ?? null,
      acknowledged_on: (c?.acknowledged_on as string | null) ?? null,
      subject: subjectByCase.get(d.case_id) ?? null,
      summary: (c?.summary as string | null) ?? null,
      organisation_name: (o?.name as string) ?? "",
      organisation_code: (o?.code as string) ?? "",
      organisation_colour: (o?.colour as string) ?? "#888888",
    };
  });

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((r) =>
      // source_ref is the reference a web form gave the requester, so a search for it finds the case.
      [r.ref, caseById.get(r.case_id)?.source_ref as string | null, r.requester_name, caseById.get(r.case_id)?.requester_email as string | null, r.subject, r.summary, r.organisation_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }

  if (filters.show) rows = rows.filter((r) => r.status === "open" && bucketOf(r) === filters.show);
  if (filters.due) rows = rows.filter((r) => r.status === "open" && r.days_left !== null && (r.type === "complaint" ? r.ack_due : r.response_due) === filters.due);

  rows.sort(compareByDeadline);
  if (filters.sort) rows = sortRows(rows, filters.sort, filters.dir);
  return { rows, error: null };
}

/** The value a column sorts by. Dates are ISO strings, so they sort as text. */
function sortValue(r: CaseListRow, sort: Exclude<CaseSort, "">): string | number | null {
  switch (sort) {
    case "ref":
      return r.ref;
    case "status":
      return r.status === "closed" ? null : r.days_left;
    case "deadline":
      return r.status === "closed" ? null : r.type === "complaint" ? r.ack_due : r.response_due;
    case "from":
      return r.requester_name?.toLowerCase() ?? null;
    case "subject":
      return r.subject?.toLowerCase() ?? null;
    case "summary":
      return r.summary?.toLowerCase() ?? null;
    case "client":
      return r.organisation_name.toLowerCase();
    case "type":
      return r.type;
    case "channel":
      return r.channel?.toLowerCase() ?? null;
    case "received":
      return r.received_on;
    case "target":
      return r.status === "open" ? r.internal_target : null;
    case "acknowledged":
      return r.acknowledged_on;
  }
}

/**
 * Sort by one column. Rows with nothing in that column go last whichever way the sort runs,
 * and ties keep the deadline order they arrived in (Array.prototype.sort is stable).
 */
export function sortRows(rows: CaseListRow[], sort: Exclude<CaseSort, "">, dir: "asc" | "desc"): CaseListRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb), "en-GB", { numeric: true });
  });
}

/** Dated deadlines first (soonest first), then stopped clocks, then acknowledged, then closed. */
function compareByDeadline(a: CaseListRow, b: CaseListRow) {
  const rank = (r: CaseListRow) => {
    if (r.status === "closed") return 3;
    if (r.clock_state === "acknowledged") return 2;
    if (r.days_left === null) return 1;
    return 0;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a.days_left as number) - (b.days_left as number);
  return b.received_on.localeCompare(a.received_on);
}

export interface CaseDetail {
  c: CaseRow;
  org: Organisation;
  deadline: DeadlineRow;
  pauses: ClockPauseRow[];
  events: CaseEventRow[];
  holidays: Holidays;
  holidayCount: number;
}

export async function getCase(id: string): Promise<CaseDetail | null> {
  const supabase = await createClient();
  const { data: c } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();
  if (!c) return null;
  const row = c as CaseRow;

  const [{ data: org }, { data: deadline }, { data: pauses }, { data: events }] = await Promise.all([
    supabase.from("organisations").select("*").eq("id", row.organisation_id).single(),
    supabase.from("v_case_deadlines").select("*").eq("case_id", id).single(),
    supabase.from("clock_pauses").select("*").eq("case_id", id).order("paused_on"),
    supabase.from("case_events").select("*").eq("case_id", id).order("at", { ascending: false }).order("id", { ascending: false }),
  ]);
  if (!org || !deadline) return null;

  const { data: holidayRows } = await supabase
    .from("bank_holidays")
    .select("day")
    .eq("region", (org as Organisation).region);
  const holidays = new Set((holidayRows ?? []).map((h) => h.day as string));

  return {
    c: row,
    org: org as Organisation,
    deadline: deadline as DeadlineRow,
    pauses: (pauses ?? []) as ClockPauseRow[],
    events: (events ?? []) as CaseEventRow[],
    holidays,
    holidayCount: holidays.size,
  };
}

export async function listClientsForForms(): Promise<Pick<Organisation, "id" | "name" | "code">[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("id, name, code").order("name");
  return (data ?? []) as Pick<Organisation, "id" | "name" | "code">[];
}

export type { ClockState };

/**
 * Cases that were returned to the inbox (migration 0019): closed, kept for the record, and
 * left out of counts. Before that migration the column does not exist; then nothing has been
 * returned, so the answer is the empty set rather than an error.
 */
export async function returnedCaseIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cases").select("id").eq("returned_to_inbox", true).limit(5000);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.id as string));
}

/** The person's saved case-list views, or null when the table is not there yet (before 0019). */
export async function listSavedViews(): Promise<{ id: string; name: string; params: unknown }[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_views").select("id, name, params").order("name");
  if (error) return null;
  return (data ?? []) as { id: string; name: string; params: unknown }[];
}
