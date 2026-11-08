// The nightly job. Call it once a night (Vercel cron, Supabase pg_cron, or curl) with the
// JOBS_SECRET. It is safe to run twice: reminders are logged per case, bucket and day;
// holidays are upserted; retention only deletes what is already past its date.
//
// This is the one place the service role is used. It sees every consultancy, which a
// reminder run has to, and nothing here is reachable from the browser without the secret.
import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { fetchGovUkHolidays } from "@/lib/jobs/holidays";
import { buildDigests, type ReminderRow } from "@/lib/jobs/reminders";
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

  // 1. Bank holidays from GOV.UK, all three regions.
  try {
    const rows = await fetchGovUkHolidays();
    const { error } = await supabase.from("bank_holidays").upsert(rows, { onConflict: "region,day" });
    report.holidays = error ? { error: error.message } : { upserted: rows.length };
  } catch (e) {
    report.holidays = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2. Retention: closed cases past each client's period, and stale form submissions.
  {
    const { data, error } = await supabase.rpc("apply_retention");
    report.retention = error ? { error: error.message } : { deleted: data as number };
  }

  // 3. Reminders: one digest per person, then log each case and bucket as sent today.
  {
    const { data, error } = await supabase.rpc("reminders_due");
    if (error) {
      report.reminders = { error: error.message };
    } else {
      const rows = (data ?? []) as ReminderRow[];
      const digests = buildDigests(rows, appUrl);
      let sent = 0;
      let failed = 0;
      for (const d of digests) {
        const result = await sendEmail({ to: d.email, subject: d.subject, text: d.text });
        if (result.sent || result.reason === "not-configured") sent++;
        else failed++;
      }
      // Log once per case and bucket, with how many people were told.
      const seen = new Map<string, { case_id: string; bucket: number; recipients: number }>();
      for (const r of rows) {
        const key = `${r.case_id}:${r.bucket}`;
        const entry = seen.get(key) ?? { case_id: r.case_id, bucket: r.bucket, recipients: 0 };
        entry.recipients++;
        seen.set(key, entry);
      }
      const logRows = [...seen.values()];
      const { error: logError } = logRows.length ? await supabase.from("reminder_log").insert(logRows) : { error: null };
      report.reminders = { cases: logRows.length, digests: digests.length, sent, failed, logError: logError?.message ?? null };
    }
  }

  return NextResponse.json({ ok: true, ...report });
}

export const GET = run;
export const POST = run;
