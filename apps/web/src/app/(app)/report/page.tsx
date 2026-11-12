import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ClientPicker, MonthPicker } from "@/components/client-picker";
import { requireMember } from "@/lib/auth";
import { listClientsForForms } from "@/lib/cases/queries";
import { monthLabel } from "@/lib/report/build";
import { getReport, parseMonth } from "@/lib/report/queries";
import { CopyButton } from "./copy-button";
import { todayInLondon } from "@/lib/today";

export const metadata: Metadata = { title: "Monthly report" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ client?: string; month?: string }> }) {
  await requireMember();
  const params = await searchParams;
  const today = todayInLondon();
  const month = parseMonth(params.month, today);
  const clients = await listClientsForForms();
  const clientId = clients.some((c) => c.id === params.client) ? (params.client as string) : (clients[0]?.id ?? "");
  const report = clientId ? await getReport(clientId, month, today) : null;

  return (
    <div className="w-full">
      <PageHeader
        title="Monthly report"
        description="What to send the client this month: one page, plain English, copy or PDF."
        actions={clients.length > 0 && <ClientPicker clients={clients} value={clientId} allowAll={false} extra={<MonthPicker value={month} />} />}
      />

      {clients.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No clients yet">Add a client first; each one gets its own monthly report.</EmptyState>
        </div>
      ) : (
        <>
          {report && (
            <section aria-labelledby="report-heading" className="surface mt-6 max-w-4xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
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
              <pre className="max-w-[72ch] whitespace-pre-wrap px-6 py-5 font-sans text-sm leading-relaxed">{report.text}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
