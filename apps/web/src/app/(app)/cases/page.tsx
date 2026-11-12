import type { Metadata } from "next";
import Link from "next/link";
import { PanelRight } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Tag, TONE_SOLID } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_TONE, type Urgency } from "@/lib/cases/labels";
import { getCase, listCases, listClientsForForms, parseFilters } from "@/lib/cases/queries";
import type { CaseListRow } from "@/lib/cases/types";
import { shortDate } from "@/lib/clocks";
import { cn } from "@/lib/utils";
import { CaseFilters } from "./case-filters";
import { CasePeek } from "./case-peek";

export const metadata: Metadata = { title: "Cases" };

/** The headings the list is split under, in the order the rows are already sorted. */
type Group = "Overdue" | "Due within 5 days" | "On track" | "Clock not running" | "Acknowledged" | "Closed";

function groupOf(r: CaseListRow, urgency: Urgency): Group {
  if (r.status === "closed") return "Closed";
  if (urgency === "overdue") return "Overdue";
  if (urgency === "warning") return "Due within 5 days";
  if (urgency === "fine") return "On track";
  if (r.clock_state === "acknowledged") return "Acknowledged";
  return "Clock not running";
}

const th = "sticky top-0 z-20 whitespace-nowrap border-b border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "border-b border-border px-3 py-2";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMember();
  const params = await searchParams;
  const filters = parseFilters(params);
  const peekId = typeof params.peek === "string" ? params.peek : "";
  const [{ rows, error }, clients, peek] = await Promise.all([listCases(filters), listClientsForForms(), peekId ? getCase(peekId) : Promise.resolve(null)]);
  const canWrite = user.membership.role !== "read_only";
  const filtered = Boolean(filters.q || filters.type || filters.client || filters.status !== "open");

  // The list's address with the current filters, with or without a case opened beside it.
  const listHref = (peekCase?: string) => {
    const q = new URLSearchParams();
    if (filters.status !== "open") q.set("status", filters.status);
    if (filters.type) q.set("type", filters.type);
    if (filters.client) q.set("client", filters.client);
    if (filters.q) q.set("q", filters.q);
    if (peekCase) q.set("peek", peekCase);
    const s = q.toString();
    return s ? `/cases?${s}` : "/cases";
  };

  // Rows arrive sorted by deadline, so each group is a run of neighbours.
  const groups: { name: Group; rows: { r: CaseListRow; urgency: Urgency }[] }[] = [];
  for (const r of rows) {
    const urgency = urgencyFor(r.clock_state, r.days_left);
    const name = groupOf(r, urgency);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.rows.push({ r, urgency });
    else groups.push({ name, rows: [{ r, urgency }] });
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Cases"
        description="What is due, in order. The legal deadline comes first."
        actions={
          <p className="text-sm tabular-nums text-muted-foreground">
            {rows.length} {rows.length === 1 ? "case" : "cases"}
          </p>
        }
      />

      <CaseFilters filters={filters} clients={clients} />

      <div className={cn("mt-4 grid items-start gap-5", peek && "xl:grid-cols-[minmax(0,1fr)_26rem]")}>
        {peek && (
          <div className="min-w-0 xl:order-2">
            <CasePeek detail={peek} closeHref={listHref()} canWrite={canWrite} />
          </div>
        )}

        <div className="min-w-0">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              The case list could not be loaded: {error}. Reload the page.
            </p>
          ) : rows.length === 0 ? (
            <EmptyState title={filtered ? "No cases match" : "No open cases"}>
              {filtered
                ? "Clear a filter or search for something else."
                : canWrite
                  ? "Accept a message from the inbox, or log a case by hand with “Log a case”."
                  : "Nothing to do here yet."}
            </EmptyState>
          ) : (
            // The table scrolls inside its own frame so the column headings and the group
            // headings stay in view however long the list is.
            <div className="surface max-h-[calc(100vh-14.5rem)] min-h-40 overflow-auto">
              <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
                <caption className="sr-only">Cases sorted by next deadline, grouped by how pressing they are</caption>
                <thead>
                  <tr>
                    <th scope="col" className={cn(th, "w-28 pl-5")}>Ref</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={th}>Next deadline</th>
                    <th scope="col" className={th}>From</th>
                    <th scope="col" className={cn(th, "w-full")}>Summary</th>
                    <th scope="col" className={th}>Client</th>
                    <th scope="col" className={th}>Type</th>
                    <th scope="col" className={cn(th, "hidden 2xl:table-cell")}>Channel</th>
                    <th scope="col" className={th}>Received</th>
                    <th scope="col" className={cn(th, "hidden xl:table-cell")} title="The team's internal target, not a legal limit">Target</th>
                    <th scope="col" className={cn(th, "hidden xl:table-cell")}>Acknowledged</th>
                    <th scope="col" className={cn(th, "pr-4")}>
                      <span className="sr-only">Preview</span>
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.name}>
                    <tr>
                      <th scope="rowgroup" colSpan={12} className="sticky top-[33px] z-10 border-b border-border bg-muted px-5 py-1.5 text-left text-xs font-semibold">
                        {g.name} <span className="ml-1 font-normal tabular-nums text-muted-foreground">{g.rows.length}</span>
                      </th>
                    </tr>
                    {g.rows.map(({ r, urgency }) => {
                      const due = r.type === "complaint" ? r.ack_due : r.response_due;
                      const tone = URGENCY_TONE[urgency];
                      const pressing = urgency === "overdue" || urgency === "warning";
                      const open = r.case_id === peek?.c.id;
                      return (
                        <tr
                          key={r.case_id}
                          className={cn(
                            "group relative hover:bg-muted/60 focus-within:bg-accent/50 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring",
                            open && "bg-accent/60 hover:bg-accent/60",
                          )}
                        >
                          <td className={cn(td, "whitespace-nowrap pl-5 font-mono text-xs font-medium tabular-nums")}>
                            {/* The coloured edge repeats the status tag for scanning; the tag carries the words. */}
                            {pressing && <span className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[tone])} aria-hidden="true" />}
                            <Link href={`/cases/${r.case_id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                              {r.ref}
                            </Link>
                          </td>
                          <td className={cn(td, "whitespace-nowrap")}>
                            <Tag tone={tone} dot>
                              {clockLabel(r.clock_state, r.days_left)}
                            </Tag>
                          </td>
                          <td className={cn(td, "whitespace-nowrap tabular-nums", pressing && "font-semibold")}>
                            {r.status === "closed" ? (
                              <span className="text-muted-foreground">{r.met_on_time === false ? "Late" : r.met_on_time ? "On time" : ""}</span>
                            ) : due ? (
                              shortDate(due)
                            ) : (
                              <span className="text-muted-foreground">Not running</span>
                            )}
                          </td>
                          <td className={cn(td, "max-w-[14rem] truncate font-medium")} title={r.requester_email ?? undefined}>
                            {r.requester_name ?? <span className="font-normal text-muted-foreground">Unknown</span>}
                          </td>
                          <td className={cn(td, "max-w-0 truncate text-muted-foreground")} title={r.summary ?? undefined}>
                            {r.summary}
                          </td>
                          <td className={cn(td, "whitespace-nowrap")}>
                            <span className="inline-flex items-center gap-2">
                              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
                              {r.organisation_name}
                            </span>
                          </td>
                          <td className={cn(td, "whitespace-nowrap")}>{typeLabel(r.type, "short")}</td>
                          <td className={cn(td, "hidden whitespace-nowrap text-muted-foreground 2xl:table-cell")}>{r.channel}</td>
                          <td className={cn(td, "whitespace-nowrap tabular-nums text-muted-foreground")}>{shortDate(r.received_on)}</td>
                          <td className={cn(td, "hidden whitespace-nowrap tabular-nums text-muted-foreground xl:table-cell")}>
                            {r.status === "open" && r.internal_target ? shortDate(r.internal_target) : ""}
                          </td>
                          <td className={cn(td, "hidden whitespace-nowrap tabular-nums xl:table-cell")}>
                            {r.acknowledged_on ? shortDate(r.acknowledged_on) : <span className="text-muted-foreground">Not yet</span>}
                          </td>
                          <td className={cn(td, "py-1 pr-4")}>
                            <Link
                              href={listHref(open ? undefined : r.case_id)}
                              scroll={false}
                              title={open ? "Close the preview" : `Preview ${r.ref} beside the list`}
                              aria-label={open ? "Close the preview" : `Preview ${r.ref} beside the list`}
                              className={cn(
                                "relative z-10 flex size-7 items-center justify-center rounded-md outline-none hover:bg-card hover:text-foreground hover:shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50",
                                open ? "text-primary" : "text-muted-foreground",
                              )}
                            >
                              <PanelRight className="size-4" aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Dates follow ICO guidance. “Target” is the team&apos;s internal target, not a legal limit.</p>
        </div>
      </div>
    </div>
  );
}
