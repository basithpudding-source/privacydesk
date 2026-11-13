// The nightly job. Call it once a night (Vercel cron, Supabase pg_cron, or curl) with the
// JOBS_SECRET. It is safe to run twice: a reminder is logged per case, stage, due date and
// person once its email has gone; holidays are upserted; retention only deletes what is
// already past its date. A reminder that could not be sent is not logged, so the next run
// sends it, and the response is a 500 so whatever schedules the job can see it failed.
//
// This is the one place the service role is used. It sees every consultancy, which a
// reminder run has to, and nothing here is reachable from the browser without the secret.
import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { fetchGovUkHolidays } from "@/lib/jobs/holidays";
import { buildDigests, delivered, logRowsFor, type Digest, type ReminderRow } from "@/lib/jobs/reminders";
import { createServiceClient, serviceConfigured } from "@/lib/supabase/service";

function authorised(request: NextRequest): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return request.nextUrl.searchParams.get("secret") === secret || header === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  if (!serviceConfigured()) return NextResponse.json({ ok: false, error: "The service role key is not set on the server; see .env.local.example." }, { status: 503 });

  const supabase = createServiceClient();
  const appUrl = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const report: Record<string, unknown> = { ranAt: new Date().toISOString() };
  const production = process.env.NODE_ENV === "production";
  let ok = true;

  // 1. Bank holidays from GOV.UK, all three regions.
  try {
    const rows = await fetchGovUkHolidays();
    const { error } = await supabase.from("bank_holidays").upsert(rows, { onConflict: "region,day" });
    report.holidays = error ? { error: error.message } : { upserted: rows.length };
    if (error) ok = false;
  } catch (e) {
    report.holidays = { error: e instanceof Error ? e.message : String(e) };
    ok = false;
  }

  // 2. Retention: closed cases past each client's period, and stale form submissions.
  {
    const { data, error } = await supabase.rpc("apply_retention");
    report.retention = error ? { error: error.message } : { deleted: data as number };
    if (error) ok = false;
  }

  // 3. Reminders: one digest per person; log only the ones whose email went.
  {
    const { data, error } = await supabase.rpc("reminders_due");
    if (error) {
      report.reminders = { error: error.message };
      ok = false;
    } else {
      const rows = (data ?? []) as ReminderRow[];
      // The kind of each desk, so an organisation's own team is not written to about "clients".
      // Before migration 0022 there is no such column: every desk then reads as a consultancy.
      const { data: kinds } = await supabase.from("partners").select("id, kind").in("id", [...new Set(rows.map((r) => r.partner_id))]);
      const kindOf = new Map((kinds ?? []).map((k) => [k.id as string, k.kind as string]));
      for (const r of rows) r.partner_kind = kindOf.get(r.partner_id);
      const digests = buildDigests(rows, appUrl);
      const sentDigests: Digest[] = [];
      let failed = 0;
      for (const d of digests) {
        const result = await sendEmail({ to: d.email, subject: d.subject, text: d.text });
        if (delivered(result, production)) sentDigests.push(d);
        else failed++;
      }
      const logRows = logRowsFor(sentDigests);
      const { error: logError } = logRows.length ? await supabase.from("reminder_log").insert(logRows) : { error: null };
      if (failed || logError) ok = false;
      report.reminders = { due: rows.length, digests: digests.length, sent: sentDigests.length, failed, logged: logError ? 0 : logRows.length, logError: logError?.message ?? null };
    }
  }

  return NextResponse.json({ ok, ...report }, { status: ok ? 200 : 500 });
}

export const GET = run;
export const POST = run;
