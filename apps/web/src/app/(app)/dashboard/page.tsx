import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CalendarClock, CircleCheck, CirclePause, FolderOpen, Hourglass, Inbox, TrendingUp, type LucideIcon } from "lucide-react";
import { ClientPicker } from "@/components/client-picker";
import { PageHeader } from "@/components/page-header";
import { ariaSort, SortHeader } from "@/components/sort-header";
import { Tag, TONE_SOLID, type Tone } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_TONE } from "@/lib/cases/labels";
import { longDate, shortDate } from "@/lib/clocks";
import { BUCKETS, type ClientBoardRow, type QueueBucket } from "@/lib/dashboard/live";
import { getDashboard } from "@/lib/dashboard/queries";
import { todayInLondon } from "@/lib/today";
import { cn } from "@/lib/utils";
import { AutoRefresh, SinceLastVisit } from "./live-extras";
import { MonthlyChart } from "./monthly-chart";

export const metadata: Metadata = { title: "Dashboard" };

const CLIENT_SORTS = ["name", "open", "overdue", "today", "soon", "onTrack", "notRunning", "inbox", "onTime"] as const;
type ClientSort = (typeof CLIENT_SORTS)[number];

/** The fill for each part of the queue bar. The two amber parts differ in strength, and the legend names both. */
const BUCKET_FILL: Record<QueueBucket, string> = {
  overdue: "bg-danger",
  today: "bg-warn",
  soon: "bg-warn/55",
  onTrack: "bg-ok",
  notRunning: "bg-muted-foreground/45",
  acknowledged: "bg-muted-foreground/25",
};

const th = "whitespace-nowrap border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground";
const td = "border-b border-border px-3 py-2";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ client?: string; sort?: string; dir?: string }> }) {
  await requireMember();
  const { client = "", sort: sortParam = "", dir: dirParam } = await searchParams;
  const sort = (CLIENT_SORTS as readonly string[]).includes(sortParam) ? (sortParam as ClientSort) : null;
  const dir = dirParam === "desc" ? "desc" : "asc";
  const today = todayInLondon();
  const now = new Date();
  const { summary: s, live, clients, error } = await getDashboard(client, today);
  const scopeName = clients.find((c) => c.id === client)?.name ?? "All clients";
  const asOf = now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const onTime = s.measured ? `${Math.round((s.met / s.measured) * 100)}%` : "—";

  // Every number opens the cases behind it, for the same client.
  const casesHref = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...extra, ...(client ? { client } : {}) }).toString();
    return q ? `/cases?${q}` : "/cases";
  };
  const bucketHref = (b: QueueBucket, extra: Record<string, string> = {}) =>
    b === "overdue" ? casesHref({ status: "overdue", ...extra }) : b === "acknowledged" ? casesHref(extra) : casesHref({ show: b, ...extra });

  // The client board sorts by any column; the share met on time sorts as a fraction.
  const value = (c: ClientBoardRow, by: ClientSort) => (by === "name" ? c.name.toLowerCase() : by === "onTime" ? (c.measured ? c.met / c.measured : null) : c[by]);
  const board = sort
    ? [...live.clients].sort((a, b) => {
        const va = value(a, sort);
        const vb = value(b, sort);
        if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
        const d = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "en-GB");
        return dir === "desc" ? -d : d;
      })
    : live.clients;
  const sortHref = (by?: ClientSort, d?: "asc" | "desc") => {
    const q = new URLSearchParams({ ...(client ? { client } : {}), ...(by ? { sort: by } : {}), ...(d === "desc" ? { dir: "desc" } : {}) }).toString();
    return q ? `/dashboard?${q}` : "/dashboard";
  };
  const sortState = (by: ClientSort) => (sort === by ? dir : "none");
  const sorter = (by: ClientSort, label: string, right = true) => (
    <th scope="col" className={cn(th, right ? "text-right" : "pl-5 text-left")} aria-sort={ariaSort(sortState(by))}>
      <SortHeader label={label} align={right ? "right" : "left"} state={sortState(by)} hrefs={{ asc: sortHref(by, "asc"), desc: sortHref(by, "desc"), clear: sortHref() }} />
    </th>
  );

  const shownBuckets = BUCKETS.filter((b) => live.queue[b.key] > 0);

  return (
    <div className="w-full">
      <AutoRefresh />
      <PageHeader
        title="Dashboard"
        description={
          <>
            <span className="font-medium text-foreground">{scopeName}</span> · as of {asOf} on {longDate(today)}. The numbers refresh every five minutes; click any of them to open the cases behind it.
          </>
        }
        actions={<ClientPicker clients={clients} value={client} />}
      />

      {error && (
        <p className="mt-6 text-sm text-destructive" role="alert">The dashboard could not be loaded: {error}. Reload the page.</p>
      )}

      {/* ---------------------------------------------------------------- Live queue */}
      <section aria-labelledby="queue-heading" className="mt-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="queue-heading" className="section-label">Live queue</h2>
          <SinceLastVisit scope={client} now={now.toISOString()} values={{ open: live.open, overdue: live.queue.overdue, dueSoon: live.queue.today + live.queue.soon, inbox: live.inbox }} />
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
          <Tile icon={FolderOpen} value={live.open} label="Open cases" href={casesHref()} />
          <Tile icon={AlarmClock} value={live.queue.overdue} label="Overdue" tone={live.queue.overdue ? "danger" : "neutral"} href={bucketHref("overdue")} />
          <Tile icon={Hourglass} value={live.queue.today} label="Due today" tone={live.queue.today ? "warn" : "neutral"} href={bucketHref("today")} />
          <Tile icon={CalendarClock} value={live.queue.soon} label="Due in 1 to 5 days" tone={live.queue.soon ? "warn" : "neutral"} href={bucketHref("soon")} />
          <Tile icon={TrendingUp} value={live.queue.onTrack} label="On track" tone={live.queue.onTrack ? "ok" : "neutral"} href={bucketHref("onTrack")} />
          <Tile
            icon={CirclePause}
            value={live.queue.notRunning}
            label="Clock not running"
            detail={live.queue.notRunning ? `${live.waitingId} waiting for ID, ${live.paused} for clarification` : undefined}
            href={bucketHref("notRunning")}
          />
          <Tile icon={Inbox} value={live.inbox} label="Inbox messages waiting" tone={live.inbox ? "info" : "neutral"} href="/inbox" />
          <Tile icon={CircleCheck} value={onTime} label="Met on time" detail={s.measured ? `${s.met} of ${s.measured} legal limits` : "Nothing measured yet"} />
        </ul>

        {live.open > 0 && (
          <div className="surface mt-3 px-5 py-4">
            <p className="text-sm font-medium" id="bar-heading">
              Where the {live.open} open {live.open === 1 ? "case stands" : "cases stand"}
            </p>
            {/* One bar, one part per state. A 2px gap separates the parts; the legend carries the words and counts. */}
            <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-labelledby="bar-heading" aria-describedby="bar-legend">
              {shownBuckets.map((b) => (
                <span key={b.key} className={cn("h-full min-w-1.5", BUCKET_FILL[b.key])} style={{ flexGrow: live.queue[b.key], flexBasis: 0 }} title={`${b.label}: ${live.queue[b.key]}`} />
              ))}
            </div>
            <ul id="bar-legend" className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {shownBuckets.map((b) => (
                <li key={b.key}>
                  <Link href={bucketHref(b.key)} className="inline-flex items-center gap-2 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className={cn("size-2.5 rounded-sm", BUCKET_FILL[b.key])} aria-hidden="true" />
                    {b.label}
                    <span className="font-semibold tabular-nums">{live.queue[b.key]}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round((live.queue[b.key] / live.open) * 100)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- Attention and the due calendar */}
      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
        <section aria-labelledby="attention-heading" className="min-w-0">
          <h2 id="attention-heading" className="section-label mb-2">Needs attention</h2>
          {s.attention.length === 0 ? (
            <p className="surface flex items-center gap-2.5 px-5 py-4 text-sm">
              <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden="true" />
              Nothing is overdue or due in the next 7 days.
            </p>
          ) : (
            <ol className="surface divide-y divide-border overflow-hidden">
              {s.attention.map((a) => {
                const tone = URGENCY_TONE[urgencyFor(a.clock_state, a.daysLeft)];
                return (
                  <li key={a.case_id}>
                    <Link href={`/cases/${a.case_id}`} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pl-5 pr-4 text-sm outline-none hover:bg-muted/50 focus-visible:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                      <span className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[tone])} aria-hidden="true" />
                      <span className="w-24 shrink-0 font-semibold tabular-nums">{shortDate(a.dueOn)}</span>
                      <span className="w-24 shrink-0 font-mono text-xs font-medium">{a.ref}</span>
                      <span className="w-24 shrink-0">{typeLabel(a.type, "short")}</span>
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.organisation.colour }} aria-hidden="true" />
                        <span className="truncate">{a.organisation.name}</span>
                      </span>
                      <Tag tone={tone} dot className="ml-auto">
                        {clockLabel(a.clock_state, a.daysLeft)}
                      </Tag>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="calendar-heading" className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="calendar-heading" className="section-label">Due calendar</h2>
            <p className="text-sm text-muted-foreground">
              {live.dueEarlier > 0 && (
                <>
                  <Link href={bucketHref("overdue")} className="font-medium text-danger-fg underline-offset-4 hover:underline">
                    {live.dueEarlier} due before this week
                  </Link>
                  {live.dueLater > 0 ? " · " : ""}
                </>
              )}
              {live.dueLater > 0 && <>{live.dueLater} due after these five weeks</>}
            </p>
          </div>
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Open cases by the day their legal deadline falls on, for five weeks from this Monday. Cases whose clock is not running have no date and are not shown.</caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((d, i) => (
                    <th key={d} scope="col" className={cn("border-b border-border px-2 py-2 text-left text-xs font-medium text-muted-foreground", i >= 5 && "w-[9%]")}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {live.weeks.map((week, w) => (
                  <tr key={week[0].date}>
                    {week.map((day, i) => {
                      const dayNo = Number(day.date.slice(8));
                      const showMonth = dayNo === 1 || (w === 0 && i === 0);
                      const overdue = day.isPast && day.cases.length > 0;
                      return (
                        <td
                          key={day.date}
                          className={cn(
                            "h-[4.75rem] border-b border-border px-2 py-1.5 align-top",
                            i > 0 && "border-l",
                            w === live.weeks.length - 1 && "border-b-0",
                            day.isWeekend && "bg-muted/40",
                            day.isPast && !overdue && "text-muted-foreground",
                            day.isToday && "bg-accent/60",
                          )}
                        >
                          <p className={cn("flex items-center gap-1 text-xs tabular-nums", day.isToday ? "font-semibold text-accent-foreground" : "text-muted-foreground")}>
                            <time dateTime={day.date}>
                              {dayNo}
                              {showMonth && ` ${MONTHS[Number(day.date.slice(5, 7)) - 1]}`}
                            </time>
                            {day.isToday && <span>· today</span>}
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {day.cases.slice(0, 2).map((c) => (
                              <li key={c.case_id}>
                                <Link
                                  href={`/cases/${c.case_id}`}
                                  title={`${c.ref} · ${typeLabel(c.type)} · ${c.organisation}${overdue ? " · overdue" : ""}`}
                                  className={cn(
                                    "flex items-center gap-1.5 truncate rounded px-1 py-0.5 font-mono text-[11px] font-medium leading-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                                    overdue ? "bg-danger-bg text-danger-fg" : "bg-muted/70 text-foreground",
                                  )}
                                >
                                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden="true" />
                                  <span className="truncate">{c.ref}</span>
                                </Link>
                              </li>
                            ))}
                            {day.cases.length > 2 && (
                              <li>
                                <Link href={casesHref({ due: day.date })} className="px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                                  +{day.cases.length - 2} more
                                </Link>
                              </li>
                            )}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------------- Client board */}
      <section aria-labelledby="clients-heading" className="mt-8">
        <h2 id="clients-heading" className="section-label mb-2">Client board</h2>
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Open cases by client and where each stands, with inbox messages waiting and the share of legal limits met on time</caption>
            <thead>
              <tr>
                {sorter("name", "Client", false)}
                {sorter("open", "Open")}
                {sorter("overdue", "Overdue")}
                {sorter("today", "Due today")}
                {sorter("soon", "1 to 5 days")}
                {sorter("onTrack", "On track")}
                {sorter("notRunning", "Not running")}
                {sorter("inbox", "Inbox")}
                {sorter("onTime", "Met on time")}
              </tr>
            </thead>
            <tbody>
              {board.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">No clients yet.</td></tr>
              ) : (
                board.map((c) => {
                  const link = (b: QueueBucket) => (b === "overdue" ? `/cases?status=overdue&client=${c.id}` : `/cases?show=${b}&client=${c.id}`);
                  const cell = (b: QueueBucket, tone: Tone) => (
                    <td className={cn(td, "text-right tabular-nums")}>
                      {c[b] ? (
                        <Link href={link(b)} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                          <Tag tone={tone}>{c[b]}</Tag>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  );
                  const pct = c.measured ? Math.round((c.met / c.measured) * 100) : null;
                  return (
                    <tr key={c.id} className="hover:bg-muted/50">
                      <td className={cn(td, "pl-5")}>
                        <Link href={`/dashboard?client=${c.id}`} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline" title={`Show the dashboard for ${c.name} only`}>
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden="true" />
                          {c.name}
                        </Link>
                      </td>
                      <td className={cn(td, "text-right font-semibold tabular-nums")}>
                        <Link href={`/cases?client=${c.id}`} className="underline-offset-4 hover:underline">{c.open}</Link>
                      </td>
                      {cell("overdue", "danger")}
                      {cell("today", "warn")}
                      {cell("soon", "warn")}
                      {cell("onTrack", "ok")}
                      {cell("notRunning", "neutral")}
                      <td className={cn(td, "text-right tabular-nums")}>{c.inbox ? <Tag tone="info">{c.inbox}</Tag> : <span className="text-muted-foreground">0</span>}</td>
                      <td className={cn(td, "pr-5")}>
                        {pct === null ? (
                          <span className="block text-right text-muted-foreground">—</span>
                        ) : (
                          <span className="flex items-center justify-end gap-2.5">
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="w-28 text-right tabular-nums">
                              {pct}% <span className="text-muted-foreground">({c.met} of {c.measured})</span>
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Work in the queue, and intake */}
      <div className="mt-8 grid gap-6 xl:grid-cols-2 xl:items-start">
        <section aria-labelledby="work-heading" className="min-w-0">
          <h2 id="work-heading" className="section-label mb-2">Work in the queue</h2>
          {live.types.length === 0 ? (
            <p className="surface px-5 py-4 text-sm text-muted-foreground">No open cases.</p>
          ) : (
            <div className="surface overflow-x-auto">
              <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
                <caption className="sr-only">Open cases by type of request, each type&apos;s share of the open work, and where its cases stand</caption>
                <thead>
                  <tr>
                    <th scope="col" className={cn(th, "pl-5 text-left")}>Type</th>
                    <th scope="col" className={cn(th, "text-right")}>Open</th>
                    <th scope="col" className={cn(th, "w-2/5 text-left")}>Share of open work</th>
                    <th scope="col" className={cn(th, "text-right")}>Overdue</th>
                    <th scope="col" className={cn(th, "text-right")}>Due in 5 days</th>
                    <th scope="col" className={cn(th, "pr-5 text-right")}>Not running</th>
                  </tr>
                </thead>
                <tbody>
                  {live.types.map((t) => {
                    const pct = Math.round(t.share * 100);
                    const soon = t.today + t.soon;
                    return (
                      <tr key={t.type} className="hover:bg-muted/50">
                        <th scope="row" className={cn(td, "pl-5 text-left font-medium")}>
                          <Link href={casesHref({ type: t.type })} className="underline-offset-4 hover:underline">{typeLabel(t.type)}</Link>
                        </th>
                        <td className={cn(td, "text-right font-semibold tabular-nums")}>{t.open}</td>
                        <td className={td}>
                          <span className="flex items-center gap-2.5">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="w-10 text-right tabular-nums text-muted-foreground">{pct}%</span>
                          </span>
                        </td>
                        <td className={cn(td, "text-right tabular-nums")}>{t.overdue ? <Tag tone="danger">{t.overdue}</Tag> : <span className="text-muted-foreground">0</span>}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{soon ? <Tag tone="warn">{soon}</Tag> : <span className="text-muted-foreground">0</span>}</td>
                        <td className={cn(td, "pr-5 text-right tabular-nums")}>{t.notRunning ? <Tag>{t.notRunning}</Tag> : <span className="text-muted-foreground">0</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="chart-heading" className="min-w-0">
          <h2 id="chart-heading" className="section-label mb-2">Cases received per month</h2>
          <div className="surface p-5">
            <p className="mb-4 text-sm text-muted-foreground">The last six months, by the month the request arrived.</p>
            <MonthlyChart months={s.months} />
          </div>
        </section>
      </div>
    </div>
  );
}

const TILE_ICON: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  neutral: "bg-muted text-muted-foreground",
};

/** One number and what it counts. A tile with a link opens the cases behind the number. */
function Tile({ icon: Icon, value, label, detail, tone = "neutral", href }: { icon: LucideIcon; value: number | string; label: string; detail?: string; tone?: Tone; href?: string }) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className={cn("block text-3xl font-semibold leading-none tabular-nums tracking-tight", tone === "warn" && "text-warn-fg", tone === "danger" && "text-danger-fg")}>{value}</span>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TILE_ICON[tone])} aria-hidden="true">
          <Icon className="size-4" />
        </span>
      </span>
      <span className="mt-2 block text-sm font-medium">{label}</span>
      {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
    </>
  );
  const box = "surface block h-full p-4";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(box, "outline-none hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50")}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}
