import type { Metadata } from "next";
import Link from "next/link";
import { ClientPicker } from "@/components/client-picker";
import { requireMember } from "@/lib/auth";
import { clockLabel, typeLabel, urgencyFor, URGENCY_CLASSES } from "@/lib/cases/labels";
import { shortDate } from "@/lib/clocks";
import { getDashboard } from "@/lib/dashboard/queries";
import { cn } from "@/lib/utils";
import { MonthlyChart } from "./monthly-chart";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  await requireMember();
  const { client = "" } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const { summary: s, clients, error } = await getDashboard(client, today);
  const scopeName = clients.find((c) => c.id === client)?.name ?? "All clients";
  const onTime = s.measured ? `${Math.round((s.met / s.measured) * 100)}%` : "—";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {scopeName}. Is any client at risk this week? “On time” counts complaint acknowledgements and closed requests against their legal limits.
        </p>
      </div>

      <ClientPicker clients={clients} value={client} />

      {error && (
        <p className="mt-6 text-sm text-destructive" role="alert">The dashboard could not be loaded: {error}. Reload the page.</p>
      )}

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile value={s.open} label="Open cases" />
        <Tile value={s.dueWeek} label="Legal deadlines in the next 7 days" tone={s.dueWeek ? "warning" : "none"} />
        <Tile value={s.overdue} label="Overdue" tone={s.overdue ? "overdue" : "none"} />
        <Tile value={onTime} label={s.measured ? `${s.met} of ${s.measured} limits met on time` : "No limits met or missed yet"} />
      </dl>

      <section aria-labelledby="attention-heading" className="mt-8">
        <h2 id="attention-heading" className="text-lg font-semibold">Needs attention</h2>
        {s.attention.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing is overdue or due in the next 7 days.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
            {s.attention.map((a) => {
              const urgency = urgencyFor(a.clock_state, a.daysLeft);
              return (
                <li key={a.case_id}>
                  <Link href={`/cases/${a.case_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{shortDate(a.dueOn)}</span>
                    <span className="font-mono">{a.ref}</span>
                    <span>{typeLabel(a.type, "short")}</span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-full" style={{ backgroundColor: a.organisation.colour }} aria-hidden="true" />
                      {a.organisation.name}
                    </span>
                    <span className={cn("ml-auto rounded-md px-2 py-0.5 text-xs font-medium", URGENCY_CLASSES[urgency])}>{clockLabel(a.clock_state, a.daysLeft)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="chart-heading" className="mt-8 rounded-lg border border-border p-5">
        <h2 id="chart-heading" className="text-lg font-semibold">Cases received per month</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">The last six months, by the month the request arrived.</p>
        <MonthlyChart months={s.months} />
      </section>

      <section aria-labelledby="clients-heading" className="mt-8">
        <h2 id="clients-heading" className="text-lg font-semibold">By client</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Cases by client</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Client</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Open</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Due in 7 days</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Overdue</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Received this month</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">On time</th>
              </tr>
            </thead>
            <tbody>
              {s.clients.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No clients yet.</td></tr>
              ) : (
                s.clients.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard?client=${c.id}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden="true" />
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.open}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.dueWeek}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.overdue ? <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", URGENCY_CLASSES.overdue)}>{c.overdue} overdue</span> : "0"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.receivedThisMonth}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.measured ? `${c.met} of ${c.measured}` : "—"}</td>
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

function Tile({ value, label, tone = "none" }: { value: number | string; label: string; tone?: "none" | "warning" | "overdue" }) {
  return (
    <div className={cn("rounded-lg border border-border p-4", tone === "warning" && "border-amber-300 dark:border-amber-800", tone === "overdue" && "border-red-300 dark:border-red-900")}>
      <dd className={cn("text-3xl font-semibold tabular-nums tracking-tight", tone === "warning" && "text-amber-900 dark:text-amber-200", tone === "overdue" && "text-red-900 dark:text-red-200")}>{value}</dd>
      <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}
