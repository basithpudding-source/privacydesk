import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, PanelBottom, PanelRight } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ariaSort, SortHeader } from "@/components/sort-header";
import { Tag, TONE_SOLID } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_TONE, type Urgency } from "@/lib/cases/labels";
import { getCase, listCases, listClientsForForms, listSavedViews, parseFilters, returnedCaseIds, type CaseSort } from "@/lib/cases/queries";
import type { CaseListRow } from "@/lib/cases/types";
import { BUILT_IN_VIEWS, cleanViewParams, type CaseView, type ViewParams } from "@/lib/cases/views";
import { shortDate } from "@/lib/clocks";
import type { CaseColumn } from "@/lib/prefs";
import { getPrefs } from "@/lib/prefs-server";
import { cn } from "@/lib/utils";
import { CaseFilters } from "./case-filters";
import { CasePeek } from "./case-peek";
import { ColumnsMenu, ViewsMenu } from "./workspace-menus";

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

interface RowContext {
  due: string | null;
  tone: "ok" | "warn" | "danger" | "neutral";
  pressing: boolean;
  returned: boolean;
}

/** Each optional column: its heading, any note for the heading, and how a row's cell is drawn. */
const COLUMNS: Record<CaseColumn, { label: string; title?: string; thClass?: string; cell: (r: CaseListRow, c: RowContext) => React.ReactNode; tdClass?: (c: RowContext) => string }> = {
  status: {
    label: "Status",
    title: "Sorts by days left",
    tdClass: () => "whitespace-nowrap",
    cell: (r, c) =>
      c.returned ? (
        <Tag tone="neutral">Returned to inbox</Tag>
      ) : (
        <Tag tone={c.tone} dot>
          {clockLabel(r.clock_state, r.days_left)}
        </Tag>
      ),
  },
  deadline: {
    label: "Next deadline",
    tdClass: (c) => cn("whitespace-nowrap tabular-nums", c.pressing && "font-semibold"),
    cell: (r, c) =>
      r.status === "closed" ? (
        <span className="text-muted-foreground">{c.returned ? "" : r.met_on_time === false ? "Late" : r.met_on_time ? "On time" : ""}</span>
      ) : c.due ? (
        shortDate(c.due)
      ) : (
        <span className="text-muted-foreground">Not running</span>
      ),
  },
  from: {
    label: "From",
    tdClass: () => "max-w-[14rem] truncate font-medium",
    cell: (r) => <span title={r.requester_email ?? undefined}>{r.requester_name ?? <span className="font-normal text-muted-foreground">Unknown</span>}</span>,
  },
  summary: {
    label: "Summary",
    thClass: "w-full",
    tdClass: () => "max-w-0 truncate text-muted-foreground",
    cell: (r) => <span title={r.summary ?? undefined}>{r.summary}</span>,
  },
  client: {
    label: "Client",
    tdClass: () => "whitespace-nowrap",
    cell: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
        {r.organisation_name}
      </span>
    ),
  },
  type: { label: "Type", tdClass: () => "whitespace-nowrap", cell: (r) => typeLabel(r.type, "short") },
  channel: { label: "Channel", tdClass: () => "whitespace-nowrap text-muted-foreground", cell: (r) => r.channel },
  received: { label: "Received", tdClass: () => "whitespace-nowrap tabular-nums text-muted-foreground", cell: (r) => shortDate(r.received_on) },
  target: {
    label: "Target",
    title: "The team's internal target, not a legal limit",
    tdClass: () => "whitespace-nowrap tabular-nums text-muted-foreground",
    cell: (r) => (r.status === "open" && r.internal_target ? shortDate(r.internal_target) : ""),
  },
  acknowledged: {
    label: "Acknowledged",
    tdClass: () => "whitespace-nowrap tabular-nums",
    cell: (r) => (r.acknowledged_on ? shortDate(r.acknowledged_on) : <span className="text-muted-foreground">Not yet</span>),
  },
};

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireMember();
  const params = await searchParams;
  const filters = parseFilters(params);
  const peekId = typeof params.peek === "string" ? params.peek : "";
  const [{ rows, error }, clients, peek, prefs, savedRows, returned] = await Promise.all([
    listCases(filters),
    listClientsForForms(),
    peekId ? getCase(peekId) : Promise.resolve(null),
    getPrefs(),
    listSavedViews(),
    returnedCaseIds(),
  ]);
  const canWrite = user.membership.role !== "read_only";
  const filtered = Boolean(filters.q || filters.type || filters.client || filters.show || filters.due || filters.status !== "open");
  const columns = prefs.caseColumns;
  const newWindow = prefs.openCases === "new";
  // A case opened in a new window keeps this list exactly as it is.
  const caseLink = newWindow ? { target: "_blank", rel: "noopener" } : {};

  // The filters and sort showing now, as a view would store them.
  const current: ViewParams = cleanViewParams({ status: filters.status, type: filters.type, client: filters.client, q: filters.q, show: filters.show, sort: filters.sort, dir: filters.dir });
  const saved: CaseView[] = (savedRows ?? []).map((v) => ({ id: v.id, name: v.name, params: cleanViewParams(v.params), builtIn: false }));

  const href = (o: { peek?: string; sort?: CaseSort; dir?: "asc" | "desc" }) => {
    const q = new URLSearchParams();
    if (filters.status !== "open") q.set("status", filters.status);
    if (filters.type) q.set("type", filters.type);
    if (filters.client) q.set("client", filters.client);
    if (filters.q) q.set("q", filters.q);
    if (filters.show) q.set("show", filters.show);
    if (filters.due) q.set("due", filters.due);
    if (o.sort) {
      q.set("sort", o.sort);
      if (o.dir === "desc") q.set("dir", "desc");
    }
    if (o.peek) q.set("peek", o.peek);
    const s = q.toString();
    return s ? `/cases?${s}` : "/cases";
  };
  const listHref = (peekCase?: string) => href({ peek: peekCase, sort: filters.sort, dir: filters.dir });
  // Sorting keeps the filters and any open preview; a third click clears the sort.
  const sortState = (col: CaseSort) => (filters.sort === col ? filters.dir : "none");
  const sortHrefs = (col: CaseSort) => ({
    asc: href({ peek: peek?.c.id, sort: col, dir: "asc" }),
    desc: href({ peek: peek?.c.id, sort: col, dir: "desc" }),
    clear: href({ peek: peek?.c.id }),
  });

  // In the default order rows arrive sorted by deadline, so each group is a run of
  // neighbours. Sorted by a column, the list is one flat run with no group headings.
  const groups: { name: Group | ""; rows: { r: CaseListRow; urgency: Urgency }[] }[] = [];
  for (const r of rows) {
    const urgency = urgencyFor(r.clock_state, r.days_left);
    const name = filters.sort ? "" : groupOf(r, urgency);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.rows.push({ r, urgency });
    else groups.push({ name, rows: [{ r, urgency }] });
  }

  const beside = prefs.preview === "right";
  const PeekIcon = beside ? PanelRight : PanelBottom;

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

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ViewsMenu builtIn={BUILT_IN_VIEWS} saved={saved} current={current} prefs={prefs} unavailable={savedRows === null} />
        <ColumnsMenu prefs={prefs} />
        {newWindow && <p className="text-xs text-muted-foreground">Cases open in a new window. Change this on your profile page.</p>}
      </div>
      <CaseFilters filters={filters} clients={clients} />

      <div className={cn("mt-4 grid items-start gap-5", peek && beside && "xl:grid-cols-[minmax(0,1fr)_26rem]")}>
        {peek && (
          <div className={cn("min-w-0", beside ? "xl:order-2" : "order-2")}>
            <CasePeek detail={peek} closeHref={listHref()} canWrite={canWrite} sticky={beside} newWindow={newWindow} />
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
                ? "Clear a filter, choose another view, or search for something else."
                : canWrite
                  ? "Accept a message from the inbox, or log a case by hand with “Log a case”."
                  : "Nothing to do here yet."}
            </EmptyState>
          ) : (
            // The table scrolls inside its own frame so the column headings and the group
            // headings stay in view however long the list is.
            <div className={cn("surface min-h-40 overflow-auto", peek && !beside ? "max-h-[45vh]" : "max-h-[calc(100vh-17rem)]")}>
              <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: `${14 + columns.length * 7}rem` }}>
                <caption className="sr-only">Cases sorted by next deadline, grouped by how pressing they are</caption>
                <thead>
                  <tr>
                    <th scope="col" className={cn(th, "w-28 pl-5")} aria-sort={ariaSort(sortState("ref"))}>
                      <SortHeader label="Ref" state={sortState("ref")} hrefs={sortHrefs("ref")} />
                    </th>
                    {columns.map((key) => (
                      <th key={key} scope="col" className={cn(th, COLUMNS[key].thClass)} aria-sort={ariaSort(sortState(key))}>
                        <SortHeader label={COLUMNS[key].label} state={sortState(key)} hrefs={sortHrefs(key)} title={COLUMNS[key].title} />
                      </th>
                    ))}
                    <th scope="col" className={cn(th, "pr-4")}>
                      <span className="sr-only">Preview, or open in a new window</span>
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.name}>
                    {g.name && (
                      <tr>
                        <th scope="rowgroup" colSpan={columns.length + 2} className="sticky top-[37px] z-10 border-b border-border bg-muted px-5 py-1.5 text-left text-xs font-semibold">
                          {g.name} <span className="ml-1 font-normal tabular-nums text-muted-foreground">{g.rows.length}</span>
                        </th>
                      </tr>
                    )}
                    {g.rows.map(({ r, urgency }) => {
                      const tone = URGENCY_TONE[urgency];
                      const ctx: RowContext = {
                        due: r.type === "complaint" ? r.ack_due : r.response_due,
                        tone,
                        pressing: urgency === "overdue" || urgency === "warning",
                        returned: returned.has(r.case_id),
                      };
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
                            {ctx.pressing && <span className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[tone])} aria-hidden="true" />}
                            <Link href={`/cases/${r.case_id}`} {...caseLink} className="outline-none after:absolute after:inset-0 after:content-['']">
                              {r.ref}
                              {newWindow && <span className="sr-only"> (opens in a new window)</span>}
                            </Link>
                          </td>
                          {columns.map((key) => (
                            <td key={key} className={cn(td, COLUMNS[key].tdClass?.(ctx))}>
                              {COLUMNS[key].cell(r, ctx)}
                            </td>
                          ))}
                          <td className={cn(td, "py-1 pr-4")}>
                            <span className="relative z-10 flex items-center justify-end gap-0.5">
                              <Link
                                href={listHref(open ? undefined : r.case_id)}
                                scroll={false}
                                title={open ? "Close the preview" : `Preview ${r.ref} ${beside ? "beside" : "below"} the list`}
                                aria-label={open ? "Close the preview" : `Preview ${r.ref}`}
                                className={cn(
                                  "flex size-7 items-center justify-center rounded-md outline-none hover:bg-card hover:text-foreground hover:shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50",
                                  open ? "text-primary" : "text-muted-foreground",
                                )}
                              >
                                <PeekIcon className="size-4" aria-hidden="true" />
                              </Link>
                              {!newWindow && (
                                <a
                                  href={`/cases/${r.case_id}`}
                                  target="_blank"
                                  rel="noopener"
                                  title={`Open ${r.ref} in a new window`}
                                  aria-label={`Open ${r.ref} in a new window`}
                                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-card hover:text-foreground hover:shadow-xs focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  <ExternalLink className="size-3.5" aria-hidden="true" />
                                </a>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Dates follow ICO guidance. “Target” is the team&apos;s internal target, not a legal limit. Click a column heading to sort by it{filters.sort ? "; click it a third time to go back to the grouped order" : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}
