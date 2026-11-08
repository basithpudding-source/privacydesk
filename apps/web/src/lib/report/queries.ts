import "server-only";
import type { CaseRow, DeadlineRow } from "@/lib/cases/types";
import type { Organisation } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { buildReport, type MonthNumbers, type ReportCase } from "./build";

export interface ReportData {
  org: Pick<Organisation, "id" | "name" | "code" | "colour">;
  month: string;
  text: string;
}

/** Month as YYYY-MM, or the current month when the value is not one. */
export function parseMonth(value: string | undefined, today: string): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
}

/** The report for one client and month, through the user's own session so RLS applies. */
export async function getReport(orgId: string, month: string, today: string): Promise<ReportData | null> {
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("id, name, code, colour").eq("id", orgId).maybeSingle();
  if (!org) return null;

  const [{ data: numbers }, { data: cases }, { data: deadlines }] = await Promise.all([
    supabase.from("v_monthly_client_report").select("*").eq("organisation_id", orgId).eq("month", `${month}-01`).maybeSingle(),
    supabase.from("cases").select("id, ref, type, status, received_on, closed_on, outcome").eq("organisation_id", orgId).order("received_on"),
    supabase.from("v_case_deadlines").select("case_id, clock_state, ack_due, response_due, days_left").eq("organisation_id", orgId),
  ]);
  const dlById = new Map(((deadlines ?? []) as Pick<DeadlineRow, "case_id" | "clock_state" | "ack_due" | "response_due" | "days_left">[]).map((d) => [d.case_id, d]));
  const rows: ReportCase[] = ((cases ?? []) as Pick<CaseRow, "id" | "ref" | "type" | "status" | "received_on" | "closed_on" | "outcome">[]).map((c) => {
    const d = dlById.get(c.id);
    return {
      ref: c.ref,
      type: c.type,
      status: c.status,
      received_on: c.received_on,
      closed_on: c.closed_on,
      outcome: c.outcome,
      clock_state: d?.clock_state ?? "running",
      ack_due: d?.ack_due ?? null,
      response_due: d?.response_due ?? null,
      days_left: d?.days_left ?? null,
    };
  });

  const text = buildReport({
    organisationName: org.name as string,
    month,
    numbers: (numbers as MonthNumbers | null) ?? null,
    cases: rows,
    today,
  });
  return { org: org as ReportData["org"], month, text };
}
