import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { typeLabel } from "@/lib/cases/labels";
import { shortDate } from "@/lib/clocks";
import { getInboxItem, listInbox } from "@/lib/inbox/queries";
import { cn } from "@/lib/utils";
import { AcceptForm, DeclineForm, RetriageButton } from "./decide-forms";
import { TriageCard } from "./triage-card";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ item?: string; view?: string }> }) {
  const user = await requireMember();
  const { item: itemId, view: viewParam } = await searchParams;
  const view = viewParam === "decided" ? "decided" : "new";
  const [{ rows, error }, selected] = await Promise.all([listInbox(view), itemId ? getInboxItem(itemId) : Promise.resolve(null)]);
  const canWrite = user.membership.role !== "read_only";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">What has come in that nobody has looked at yet. Accept it into a case, or decline it.</p>
        </div>
        {canWrite && (
          <Button render={<Link href="/inbox/paste" />} nativeButton={false}>
            Paste an email
          </Button>
        )}
      </div>

      <div className="mt-4 flex gap-2 text-sm">
        <Link href="/inbox" className={cn("rounded-md px-2.5 py-1", view === "new" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
          New
        </Link>
        <Link href="/inbox?view=decided" className={cn("rounded-md px-2.5 py-1", view === "decided" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
          Decided
        </Link>
      </div>

      <div className={cn("mt-4 grid gap-6", selected ? "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" : "")}>
        <div className="min-w-0">
          {error ? (
            <p className="text-sm text-destructive" role="alert">The inbox could not be loaded: {error}. Reload the page.</p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="font-medium">{view === "new" ? "Nothing waiting" : "Nothing decided yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {view === "new" ? "New messages land here from each client's forwarding address and public form, or paste one by hand." : "Accepted and declined items show here."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {rows.map((r) => {
                const active = r.id === selected?.id;
                const t = r.triage;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/inbox?${new URLSearchParams({ ...(view === "decided" ? { view } : {}), item: r.id }).toString()}`}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cn("block px-3 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset", active && "bg-muted")}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
                          {r.organisation_name}
                        </span>
                        <span className="shrink-0 tabular-nums">{shortDate(r.received_at.slice(0, 10))}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">{r.from_name ?? r.from_email ?? "Unknown sender"}</p>
                      <p className="truncate text-sm text-muted-foreground">{r.subject ?? t?.summary ?? r.body.slice(0, 80)}</p>
                      <p className="mt-1 text-xs">
                        {r.status !== "new" ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{r.status === "accepted" ? `Accepted as ${r.case_ref ?? "a case"}` : "Declined"}</span>
                        ) : t ? (
                          <span className={cn("rounded-md px-1.5 py-0.5", t.type === "not_dp" ? "bg-muted text-muted-foreground" : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200")}>
                            {t.type === "not_dp" ? "Not personal data?" : typeLabel(t.type, "short")} · {Math.round(t.confidence * 100)}%
                          </span>
                        ) : (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">Not triaged</span>
                        )}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selected && (
          <article className="min-w-0 rounded-lg border border-border p-5" aria-labelledby="item-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="item-heading" className="text-lg font-semibold">
                  {selected.subject ?? "(no subject)"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  From {selected.from_name ?? "unknown"}{selected.from_email ? ` <${selected.from_email}>` : ""} · to {selected.organisation_name} ·{" "}
                  {selected.channel === "paste" ? "pasted" : selected.channel === "form" ? "web form" : "email"} · {shortDate(selected.received_at.slice(0, 10))}
                </p>
                {selected.channel === "form" && (
                  <p className="mt-1 text-sm">
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Email address verified</span>{" "}
                    <span className="text-muted-foreground">
                      on {shortDate(selected.received_at.slice(0, 10))}; the requester was given reference <span className="font-mono">{selected.source_ref}</span>
                      {selected.requested_type && <> and asked for {selected.requested_type === "sar" ? "a copy of their data" : selected.requested_type === "complaint" ? "a complaint to be looked at" : "something else"}</>}.
                    </span>
                  </p>
                )}
              </div>
              <Link href={view === "decided" ? "/inbox?view=decided" : "/inbox"} scroll={false} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                Close
              </Link>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              <section aria-labelledby="message-heading">
                <h3 id="message-heading" className="text-sm font-medium text-muted-foreground">The message</h3>
                <p className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{selected.body}</p>
              </section>
              <section aria-labelledby="triage-heading">
                <div className="flex items-center justify-between">
                  <h3 id="triage-heading" className="text-sm font-medium text-muted-foreground">Triage</h3>
                  {canWrite && selected.status === "new" && <RetriageButton itemId={selected.id} />}
                </div>
                <div className="mt-1">
                  <TriageCard triage={selected.triage} />
                </div>
              </section>
            </div>

            {selected.status === "new" ? (
              canWrite ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <section aria-labelledby="accept-heading">
                    <h3 id="accept-heading" className="mb-3 text-sm font-medium text-muted-foreground">Accept into a case</h3>
                    <AcceptForm
                      itemId={selected.id}
                      today={today}
                      proposed={{
                        // A web form requester chose a type themselves; that beats a guess from the text.
                        type:
                          selected.requested_type === "sar" || selected.requested_type === "complaint"
                            ? selected.requested_type
                            : selected.triage?.type && selected.triage.type !== "not_dp"
                              ? selected.triage.type
                              : "sar",
                        receivedOn: selected.received_at.slice(0, 10),
                        requesterName: selected.triage?.requesterName ?? selected.from_name ?? "",
                        requesterEmail: selected.triage?.requesterEmail ?? selected.from_email ?? "",
                        summary: selected.triage?.summary && selected.triage.by === "ai" ? selected.triage.summary : "",
                        idRequired: Boolean(selected.triage?.idCheckSuggested),
                      }}
                    />
                  </section>
                  <section aria-labelledby="decline-heading">
                    <h3 id="decline-heading" className="mb-3 text-sm font-medium text-muted-foreground">Or decline</h3>
                    <DeclineForm itemId={selected.id} />
                  </section>
                </div>
              ) : (
                <p className="mt-6 text-sm text-muted-foreground">You can read the inbox but not decide items.</p>
              )
            ) : (
              <p className="mt-6 text-sm">
                {selected.status === "accepted" ? (
                  <>
                    Accepted into{" "}
                    <Link href={`/cases/${selected.case_id}`} className="font-mono underline underline-offset-4">
                      {selected.case_ref ?? "a case"}
                    </Link>
                    {selected.decided_at && <> on {shortDate(selected.decided_at.slice(0, 10))}</>}.
                  </>
                ) : (
                  <>Declined{selected.decided_at && <> on {shortDate(selected.decided_at.slice(0, 10))}</>}: {selected.decline_reason}</>
                )}
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
