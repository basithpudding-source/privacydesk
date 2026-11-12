import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Tag, TONE_SOLID } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_TONE } from "@/lib/cases/labels";
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
  const filtered = Boolean(filters.q || filters.type || filters.client || filters.status !== "open");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Cases" description="What is due, in order. The legal deadline comes first." />

      <CaseFilters filters={filters} clients={clients} />

      {error ? (
        <p className="mt-6 text-sm text-destructive" role="alert">
          The case list could not be loaded: {error}. Reload the page.
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={filtered ? "No cases match" : "No open cases"}>
            {filtered
              ? "Clear a filter or search for something else."
              : canWrite
                ? "Accept a message from the inbox, or log a case by hand with “Log a case”."
                : "Nothing to do here yet."}
          </EmptyState>
        </div>
      ) : (
        <div className="surface mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Cases sorted by next deadline</caption>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-32 py-2.5 pl-5 pr-3 font-medium">Ref</th>
                <th scope="col" className="px-3 py-2.5 font-medium">From</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Client</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Type</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Received</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Next deadline</th>
                <th scope="col" className="py-2.5 pl-3 pr-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const due = r.type === "complaint" ? r.ack_due : r.response_due;
                const urgency = urgencyFor(r.clock_state, r.days_left);
                const tone = URGENCY_TONE[urgency];
                const pressing = urgency === "overdue" || urgency === "warning";
                return (
                  <tr
                    key={r.case_id}
                    className="group relative hover:bg-muted/50 focus-within:bg-accent/50 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring"
                  >
                    <td className="py-3 pl-5 pr-3 align-top font-mono text-xs font-medium tabular-nums">
                      {/* The coloured edge repeats the status tag for scanning; the tag carries the words. */}
                      {pressing && <span className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[tone])} aria-hidden="true" />}
                      <Link href={`/cases/${r.case_id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                        {r.ref}
                      </Link>
                    </td>
                    <td className="max-w-[20rem] px-3 py-3 align-top">
                      <span className="block truncate font-medium">{r.requester_name ?? <span className="font-normal text-muted-foreground">Unknown</span>}</span>
                      {r.summary && <span className="block truncate text-xs text-muted-foreground">{r.summary}</span>}
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
                        {r.organisation_name} · {typeLabel(r.type, "short")}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 align-top sm:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
                        {r.organisation_name}
                      </span>
                      <span className="block pl-[1.125rem] text-xs text-muted-foreground md:hidden">{typeLabel(r.type, "short")}</span>
                    </td>
                    <td className="hidden px-3 py-3 align-top md:table-cell">{typeLabel(r.type, "short")}</td>
                    <td className="hidden px-3 py-3 align-top tabular-nums text-muted-foreground lg:table-cell">{shortDate(r.received_on)}</td>
                    <td className={cn("whitespace-nowrap px-3 py-3 align-top tabular-nums", pressing && "font-semibold")}>
                      {r.status === "closed" ? (
                        <span className="text-muted-foreground">{r.met_on_time === false ? "Late" : r.met_on_time ? "On time" : ""}</span>
                      ) : due ? (
                        shortDate(due)
                      ) : (
                        <span className="text-muted-foreground">Clock not running</span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-5 align-top">
                      <Tag tone={tone} dot>
                        {clockLabel(r.clock_state, r.days_left)}
                      </Tag>
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
