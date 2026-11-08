import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { ClientPicker, MonthPicker } from "@/components/client-picker";
import { requireMember } from "@/lib/auth";
import { listClientsForForms } from "@/lib/cases/queries";
import { monthLabel } from "@/lib/report/build";
import { getReport, parseMonth } from "@/lib/report/queries";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Monthly report" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ client?: string; month?: string }> }) {
  await requireMember();
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const month = parseMonth(params.month, today);
  const clients = await listClientsForForms();
  const clientId = clients.some((c) => c.id === params.client) ? (params.client as string) : (clients[0]?.id ?? "");
  const report = clientId ? await getReport(clientId, month, today) : null;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monthly report</h1>
        <p className="mt-1 text-sm text-muted-foreground">What to send the client this month: one page, plain English, copy or PDF.</p>
      </div>

      {clients.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Add a client first.</p>
      ) : (
        <>
          <ClientPicker clients={clients} value={clientId} allowAll={false} extra={<MonthPicker value={month} />} />

          {report && (
            <section aria-labelledby="report-heading" className="mt-6 rounded-lg border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 id="report-heading" className="flex items-center gap-2 text-lg font-semibold">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: report.org.colour }} aria-hidden="true" />
                  {report.org.name}, {monthLabel(month)}
                </h2>
                <div className="flex gap-2">
                  <CopyButton text={report.text} />
                  <Button render={<a href={`/api/report/pdf?client=${report.org.id}&month=${month}`} />} nativeButton={false}>
                    Download PDF
                  </Button>
                </div>
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{report.text}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
