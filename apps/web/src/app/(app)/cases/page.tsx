import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_CLASSES } from "@/lib/cases/labels";
import { listCases, listClientsForForms, parseFilters } from "@/lib/cases/queries";
import { shortDate } from "@/lib/clocks";
import { cn } from "@/lib/utils";
import { CaseFilters } from "./case-filters";

export const metadata: Metadata = { title: "Cases" };

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMember();
  const filters = parseFilters(await searchParams);
  const [{ rows, error }, clients] = await Promise.all([listCases(filters), listClientsForForms()]);
  const canWrite = user.membership.role !== "read_only";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-muted-foreground">What is due, in order. The legal deadline comes first.</p>
        </div>
        {canWrite && (
          <Button render={<Link href="/cases/new" />} nativeButton={false} title="Log a case by hand (C)">
            Log a case
          </Button>
        )}
      </div>

      <CaseFilters filters={filters} clients={clients} />

      {error ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          The case list could not be loaded: {error}. Reload the page.
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">{filters.q || filters.type || filters.client || filters.status !== "open" ? "No cases match" : "No open cases"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filters.q || filters.type || filters.client || filters.status !== "open"
              ? "Clear a filter or search for something else."
              : canWrite
                ? "Log the first one by hand, or wait for the inbox in the next slice."
                : "Nothing to do here yet."}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Cases sorted by next deadline</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-28 px-3 py-2 font-medium">Ref</th>
                <th scope="col" className="px-3 py-2 font-medium">Client</th>
                <th scope="col" className="px-3 py-2 font-medium">Type</th>
                <th scope="col" className="px-3 py-2 font-medium">From</th>
                <th scope="col" className="px-3 py-2 font-medium">Received</th>
                <th scope="col" className="px-3 py-2 font-medium">Next deadline</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const due = r.type === "complaint" ? r.ack_due : r.response_due;
                const urgency = urgencyFor(r.clock_state, r.days_left);
                return (
                  <tr
                    key={r.case_id}
                    className="group relative border-t border-border hover:bg-muted/40 focus-within:bg-muted/40 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">
                      <Link href={`/cases/${r.case_id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                        {r.ref}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
                        {r.organisation_name}
                      </span>
                    </td>
                    <td className="px-3 py-2">{typeLabel(r.type, "short")}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2">{r.requester_name ?? <span className="text-muted-foreground">Unknown</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{shortDate(r.received_on)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.status === "closed" ? (
                        <span className="text-muted-foreground">{r.met_on_time === false ? "Late" : r.met_on_time ? "On time" : ""}</span>
                      ) : due ? (
                        shortDate(due)
                      ) : (
                        <span className="text-muted-foreground">Clock not running</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-medium", URGENCY_CLASSES[urgency])}>
                        {clockLabel(r.clock_state, r.days_left)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? "case" : "cases"}. Dates follow ICO guidance; the internal target is shown on each case.
      </p>
    </div>
  );
}
