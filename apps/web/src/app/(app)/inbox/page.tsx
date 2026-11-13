import { deskWords } from "@/lib/desk";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ClipboardPaste, FileUp } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { requireMember } from "@/lib/auth";
import { typeLabel } from "@/lib/cases/labels";
import { shortDate } from "@/lib/clocks";
import { getInboxItem, listInbox, listInboxEvents } from "@/lib/inbox/queries";
import { cn } from "@/lib/utils";
import { UndoForm } from "@/components/undo-form";
import { reopenItem, returnCaseToInbox } from "./actions";
import { AcceptForm, DeclineForm, RetriageButton } from "./decide-forms";
import { TriageCard } from "./triage-card";
import { londonDate, todayInLondon } from "@/lib/today";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ item?: string; view?: string }> }) {
  const user = await requireMember();
  const { item: itemId, view: viewParam } = await searchParams;
  const view = viewParam === "decided" ? "decided" : "new";
  const [{ rows, error }, selected, history] = await Promise.all([listInbox(view), itemId ? getInboxItem(itemId) : Promise.resolve(null), itemId ? listInboxEvents(itemId) : Promise.resolve([])]);
  const canWrite = user.membership.role !== "read_only";
  const words = deskWords(user.membership.kind);
  const today = todayInLondon();

  const tab = (on: boolean) =>
    cn(
      "flex h-7 items-center rounded-md px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      on ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
    );
  const backHref = view === "decided" ? "/inbox?view=decided" : "/inbox";

  return (
    <div className="w-full">
      <PageHeader
        title="Inbox"
        description="What has come in that nobody has looked at yet. Accept it into a case, or decline it."
        actions={
          canWrite && (
            <>
              <Button variant="outline" size="lg" render={<Link href="/inbox/paste" />} nativeButton={false}>
                <ClipboardPaste data-icon="inline-start" aria-hidden="true" />
                Paste an email
              </Button>
              <Button variant="outline" size="lg" render={<Link href="/inbox/import" />} nativeButton={false}>
                <FileUp data-icon="inline-start" aria-hidden="true" />
                Import emails
              </Button>
            </>
          )
        }
      />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] 2xl:grid-cols-[26rem_minmax(0,1fr)]">
        {/* On a phone the list gives way to the open message; "Back to the inbox" returns to it. */}
        <div className={cn("min-w-0", selected && "hidden lg:block")}>
          <div className="mb-3 flex w-fit rounded-lg border border-border bg-card p-0.5">
            <Link href="/inbox" aria-current={view === "new" ? "page" : undefined} className={tab(view === "new")}>
              New
            </Link>
            <Link href="/inbox?view=decided" aria-current={view === "decided" ? "page" : undefined} className={tab(view === "decided")}>
              Decided
            </Link>
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">The inbox could not be loaded: {error}. Reload the page.</p>
          ) : rows.length === 0 ? (
            <EmptyState title={view === "new" ? "Nothing waiting" : "Nothing decided yet"}>
              {view === "new" ? words.inboxSource : "Accepted and declined items show here."}
            </EmptyState>
          ) : (
            <ul className="surface divide-y divide-border overflow-hidden">
              {rows.map((r) => {
                const active = r.id === selected?.id;
                const t = r.triage;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/inbox?${new URLSearchParams({ ...(view === "decided" ? { view } : {}), item: r.id }).toString()}`}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "relative block px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                        active && "bg-accent/60 hover:bg-accent/60",
                      )}
                    >
                      {active && <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />}
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{r.from_name ?? r.from_email ?? "Unknown sender"}</p>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(londonDate(r.received_at))}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.subject ?? t?.summary ?? r.body.slice(0, 80)}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {words.hasClients && (
                            <>
                              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.organisation_colour }} aria-hidden="true" />
                              <span className="truncate">{r.organisation_name}</span>
                            </>
                          )}
                        </span>
                        {r.status !== "new" ? (
                          <Tag tone={r.status === "accepted" ? "ok" : "neutral"}>{r.status === "accepted" ? `Accepted as ${r.case_ref ?? "a case"}` : "Declined"}</Tag>
                        ) : t ? (
                          <Tag tone={t.type === "not_dp" ? "neutral" : "info"}>
                            {t.type === "not_dp" ? "Not personal data?" : typeLabel(t.type, "short")} · {Math.round(t.confidence * 100)}%
                          </Tag>
                        ) : (
                          <Tag>Not triaged</Tag>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!selected && (
          <div className="hidden min-h-64 items-center justify-center rounded-xl border border-dashed border-input px-6 text-center text-sm text-muted-foreground lg:flex">
            {rows.length === 0 ? "Nothing to read yet." : "Choose a message on the left to read it and decide."}
          </div>
        )}

        {selected && (
          <article className="surface min-w-0" aria-labelledby="item-heading">
            <div className="border-b border-border p-5">
              <Link href={backHref} scroll={false} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline lg:hidden">
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to the inbox
              </Link>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 id="item-heading" className="text-lg font-semibold">
                  {selected.subject ?? "(no subject)"}
                </h2>
                <Link href={backHref} scroll={false} className="hidden text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline lg:inline">
                  Close
                </Link>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                From <span className="text-foreground">{selected.from_name ?? "unknown"}</span>
                {selected.from_email ? ` <${selected.from_email}>` : ""}{words.hasClients ? ` · to ${selected.organisation_name}` : ""} ·{" "}
                {selected.channel === "paste" ? "pasted" : selected.channel === "form" ? "web form" : "email"} · received {shortDate(londonDate(selected.received_at))}
              </p>
              {selected.channel === "form" && (
                <p className="mt-2 text-sm">
                  <Tag tone="ok">Email address verified</Tag>{" "}
                  <span className="text-muted-foreground">
                    on {shortDate(londonDate(selected.received_at))}; the requester was given reference <span className="font-mono">{selected.source_ref}</span>
                    {selected.requested_type && <> and asked for {selected.requested_type === "sar" ? "a copy of their data" : selected.requested_type === "complaint" ? "a complaint to be looked at" : "something else"}</>}.
                  </span>
                </p>
              )}
            </div>

            <div className="grid xl:grid-cols-[minmax(0,1fr)_28rem]">
              <section aria-labelledby="message-heading" className="p-5">
                <h3 id="message-heading" className="section-label flex h-7 items-center">The message</h3>
                <p className="mt-2 max-h-96 max-w-[80ch] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-sm leading-relaxed xl:max-h-[calc(100vh-22rem)]">{selected.body}</p>
              </section>
              <div className="min-w-0 border-t border-border xl:border-l xl:border-t-0">
              <section aria-labelledby="triage-heading" className="p-5">
                <div className="flex h-7 items-center justify-between">
                  <h3 id="triage-heading" className="section-label">Triage</h3>
                  {canWrite && selected.status === "new" && <RetriageButton itemId={selected.id} />}
                </div>
                <div className="mt-2">
                  <TriageCard triage={selected.triage} />
                </div>
              </section>

            <div className="border-t border-border p-5">
              {selected.status === "new" ? (
                canWrite ? (
                  <div className="flex flex-col gap-5">
                    <section aria-labelledby="accept-heading">
                      <h3 id="accept-heading" className="mb-3 font-semibold">Accept into a case</h3>
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
                          receivedOn: londonDate(selected.received_at),
                          requesterName: selected.triage?.requesterName ?? selected.from_name ?? "",
                          requesterEmail: selected.triage?.requesterEmail ?? selected.from_email ?? "",
                          summary: selected.triage?.summary && selected.triage.by === "ai" ? selected.triage.summary : "",
                          idRequired: Boolean(selected.triage?.idCheckSuggested),
                        }}
                      />
                    </section>
                    <section aria-labelledby="decline-heading" className="border-t border-border pt-5">
                      <h3 id="decline-heading" className="mb-3 font-semibold">Or decline</h3>
                      <DeclineForm itemId={selected.id} />
                    </section>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">You can read the inbox but not decide items.</p>
                )
              ) : (
                <p className="text-sm">
                  {selected.status === "accepted" ? (
                    <>
                      Accepted into{" "}
                      <Link href={`/cases/${selected.case_id}`} className="font-mono underline underline-offset-4">
                        {selected.case_ref ?? "a case"}
                      </Link>
                      {selected.decided_at && <> on {shortDate(londonDate(selected.decided_at))}</>}.
                    </>
                  ) : (
                    <>Declined{selected.decided_at && <> on {shortDate(londonDate(selected.decided_at))}</>}: {selected.decline_reason}</>
                  )}
                </p>
              )}

              {/* Undo: a decided message can go back to the inbox, with the reason on the record. */}
              {selected.status !== "new" && canWrite && (
                <div className="mt-5 border-t border-border pt-5">
                  {selected.status === "declined" ? (
                    <UndoForm
                      action={reopenItem.bind(null, selected.id)}
                      title="Put it back in the inbox"
                      explain="Use this if it was declined by mistake. It returns to New so triage can be run again and it can be accepted or declined afresh. The decline stays on the log below."
                      button="Put back in the inbox"
                      placeholder="For example: declined by mistake; it is a subject access request"
                    />
                  ) : selected.case_id ? (
                    <UndoForm
                      action={returnCaseToInbox.bind(null, selected.case_id)}
                      title="Return the case to the inbox"
                      explain={`Use this if it was accepted with the wrong details. Case ${selected.case_ref ?? ""} is closed and kept for the record (it is never deleted), and this message returns to New to be triaged and accepted again as a new case. The case must be open.`}
                      button="Close the case and put the message back"
                      placeholder="For example: accepted as a SAR; it is a complaint"
                    />
                  ) : null}
                </div>
              )}

              {history.length > 0 && (
                <section aria-labelledby="history-heading" className="mt-5 border-t border-border pt-5">
                  <h3 id="history-heading" className="section-label">What has happened to this message</h3>
                  <ol className="mt-2 space-y-2.5 text-sm">
                    {history.map((e) => (
                      <li key={e.id}>
                        <p>{e.text}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {shortDate(londonDate(e.at))} · {e.actor === user.id ? "you" : e.actor ? `user ${e.actor.slice(0, 8)}` : "system"}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
