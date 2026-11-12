import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CalendarClock, CircleCheck, FolderOpen, type LucideIcon } from "lucide-react";
import { ClientPicker } from "@/components/client-picker";
import { PageHeader } from "@/components/page-header";
import { Tag, TONE_SOLID, type Tone } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_TONE } from "@/lib/cases/labels";
import { shortDate } from "@/lib/clocks";
import { getDashboard } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";
import { MonthlyChart } from "./monthly-chart";
import { todayInLondon } from "@/lib/today";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireMember();
  const { client = "" } = await searchParams;
  const today = todayInLondon();
  const { summary: s, clients, error } = await getDashboard(client, today);
  const scopeName = clients.find((c) => c.id === client)?.name ?? "All clients";
  const onTime = s.measured ? `${Math.round((s.met / s.measured) * 100)}%` : "—";
  // Each tile opens the case list with the matching filter, for the same client.
  const casesHref = (status?: string) => {
    const q = new URLSearchParams({ ...(status ? { status } : {}), ...(client ? { client } : {}) }).toString();
    return q ? `/cases?${q}` : "/cases";
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Dashboard"
        description={<>{scopeName}. Is any client at risk this week? “On time” counts complaint acknowledgements and closed requests against their legal limits.</>}
        actions={<ClientPicker clients={clients} value={client} />}
      />

      {error && (
        <p className="mt-6 text-sm text-destructive" role="alert">The dashboard could not be loaded: {error}. Reload the page.</p>
      )}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={FolderOpen} value={s.open} label="Open cases" href={casesHref()} />
        <Tile icon={CalendarClock} value={s.dueWeek} label="Legal deadlines in the next 7 days" tone={s.dueWeek ? "warn" : "neutral"} href={casesHref("week")} />
        <Tile icon={AlarmClock} value={s.overdue} label="Overdue" tone={s.overdue ? "danger" : "neutral"} href={casesHref("overdue")} />
        <Tile
          icon={CircleCheck}
          value={onTime}
          label={s.measured ? `${s.met} of ${s.measured} legal limits met on time` : "No limits met or missed yet"}
        />
      </ul>

      <section aria-labelledby="attention-heading" className="mt-8">
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
                  <Link href={`/cases/${a.case_id}`} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 py-3 pl-5 pr-4 text-sm outline-none hover:bg-muted/50 focus-visible:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                    <span className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[tone])} aria-hidden="true" />
                    <span className="w-24 shrink-0 font-semibold tabular-nums">{shortDate(a.dueOn)}</span>
                    <span className="w-24 shrink-0 font-mono text-xs font-medium">{a.ref}</span>
                    <span className="w-28 shrink-0">{typeLabel(a.type, "short")}</span>
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

      <section aria-labelledby="chart-heading" className="surface mt-8 p-5">
        <h2 id="chart-heading" className="font-semibold">Cases received per month</h2>
        <p className="mb-4 mt-0.5 text-sm text-muted-foreground">The last six months, by the month the request arrived.</p>
        <MonthlyChart months={s.months} />
      </section>

      <section aria-labelledby="clients-heading" className="mt-8">
        <h2 id="clients-heading" className="section-label mb-2">By client</h2>
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Cases by client</caption>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Client</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Open</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Due in 7 days</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Overdue</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Received this month</th>
                <th scope="col" className="py-2.5 pl-3 pr-5 text-right font-medium">On time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.clients.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">No clients yet.</td></tr>
              ) : (
                s.clients.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <td className="py-2.5 pl-5 pr-3">
                      <Link href={`/dashboard?client=${c.id}`} className="inline-flex items-center gap-2 font-medium underline-offset-4 hover:underline">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden="true" />
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.open}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.dueWeek ? <Tag tone="warn">{c.dueWeek} due</Tag> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.overdue ? <Tag tone="danger">{c.overdue} overdue</Tag> : <span className="text-muted-foreground">0</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.receivedThisMonth}</td>
                    <td className="py-2.5 pl-3 pr-5 text-right tabular-nums">{c.measured ? `${c.met} of ${c.measured}` : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
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
function Tile({ icon: Icon, value, label, tone = "neutral", href }: { icon: LucideIcon; value: number | string; label: string; tone?: Tone; href?: string }) {
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TILE_ICON[tone])} aria-hidden="true">
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-3xl font-semibold leading-none tabular-nums tracking-tight", tone === "warn" && "text-warn-fg", tone === "danger" && "text-danger-fg")}>{value}</span>
        <span className="mt-1.5 block text-sm text-muted-foreground">{label}</span>
      </span>
    </>
  );
  const box = "surface flex h-full items-start gap-3.5 p-4";
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
