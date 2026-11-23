// The download of everything held for one organisation, for an administrator to hand back
// when a client leaves (or for an organisation's own records). Every row is read through the
// administrator's own session, so row-level security decides what can be exported; the
// download is written to the team log before it is sent, and nothing is kept on the server.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { casesSheet, exportDocument, exportFileName, type CaseSheetRow } from "@/lib/export";
import { whoDid } from "@/lib/people";
import { peopleOfDesk } from "@/lib/people-server";
import { createClient } from "@/lib/supabase/server";
import { todayInLondon } from "@/lib/today";

type Row = Record<string, unknown>;
type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

const PAGE = 1000;

/** Every row of a query, however many: the API hands back at most a thousand at a time. */
async function all(page: (from: number, to: number) => Page): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < PAGE) return out;
  }
}

/** Rows that belong to a long list of cases, asked for a hundred cases at a time so no request is too long. */
async function forCases(ids: string[], page: (chunk: string[], from: number, to: number) => Page): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    out.push(...(await all((from, to) => page(chunk, from, to))));
  }
  return out;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.membership) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (user.membership.role !== "partner_admin" || user.assurance !== "aal2") {
    return NextResponse.json({ error: "Only an administrator who has entered their authenticator code can export." }, { status: 403 });
  }
  const id = request.nextUrl.searchParams.get("client") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return NextResponse.json({ error: "That export is not here." }, { status: 404 });
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  const supabase = await createClient();
  const { data: organisation } = await supabase.from("organisations").select("*").eq("id", id).maybeSingle();
  if (!organisation) return NextResponse.json({ error: "That export is not here." }, { status: 404 });

  let body: string;
  try {
    const cases = await all((from, to) => supabase.from("cases").select("*").eq("organisation_id", id).order("received_on").order("id").range(from, to));
    const caseIds = cases.map((c) => String(c.id));
    if (format === "csv") {
      const deadlines = await all((from, to) => supabase.from("v_case_deadlines").select("case_id, ack_due, response_due, met_on_time").eq("organisation_id", id).order("case_id").range(from, to));
      const due = new Map(deadlines.map((d) => [String(d.case_id), d]));
      body = casesSheet(cases.map((c) => ({ ...c, ...(due.get(String(c.id)) ?? {}) }) as unknown as CaseSheetRow));
    } else {
      const [events, pauses, messages, messageEvents, people] = await Promise.all([
        forCases(caseIds, (chunk, from, to) => supabase.from("case_events").select("*").in("case_id", chunk).order("id").range(from, to)),
        forCases(caseIds, (chunk, from, to) => supabase.from("clock_pauses").select("*").in("case_id", chunk).order("paused_on").order("case_id").range(from, to)),
        all((from, to) => supabase.from("inbox_items").select("*").eq("organisation_id", id).order("received_at").order("id").range(from, to)),
        all((from, to) => supabase.from("inbox_events").select("*").eq("organisation_id", id).order("id").range(from, to)),
        peopleOfDesk(),
      ]);
      // In a copy that leaves the desk, "you" would mean nothing: everyone is named.
      const who = (actor: string | null) => whoDid(actor, "", people);
      body = JSON.stringify(exportDocument({ organisation, cases, events, pauses, messages, messageEvents, madeAt: new Date().toISOString(), madeBy: user.email, who }), null, 2);
    }
  } catch {
    return NextResponse.json({ error: "The export could not be put together. Try again in a minute." }, { status: 500 });
  }

  // The record first: a download that could not be written to the team log is not sent.
  const { error: noted } = await supabase.rpc("note_export", { p_org: id });
  if (noted) {
    const missing = noted.code === "PGRST202" || noted.code === "42883";
    return NextResponse.json({ error: missing ? "The database needs migration 0024 before an export can be taken." : "The export could not be recorded on the team log, so it was not made." }, { status: missing ? 503 : 500 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(String(organisation.code), todayInLondon(), format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
