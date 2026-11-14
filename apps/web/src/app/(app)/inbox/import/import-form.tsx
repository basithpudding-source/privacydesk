"use client";

import { useDesk } from "@/components/desk-context";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ArrowRight, FileUp, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { shortDate } from "@/lib/clocks";
import type { ParsedEmail } from "@/lib/inbox/parse-email";
import { londonDate } from "@/lib/today";
import { cn } from "@/lib/utils";
import { mailboxMode } from "@/lib/mailbox/connect";
import { importEmails, type ImportResult } from "../actions";
import { MailboxPicker } from "./mailbox-picker";

interface Row extends ParsedEmail {
  key: string;
  organisationId: string;
  result?: ImportResult;
}

const LIMIT = 25;
/** Bigger than this is nearly always attachments; the text alone is tiny. */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const selectClass = cn(
  "h-8 w-56 max-w-full rounded-lg border border-input bg-card px-2 text-sm",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);
const th = "whitespace-nowrap border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "border-b border-border px-3 py-2 align-top";

/**
 * Add saved emails (.eml or Outlook .msg) by dropping them here or choosing them. They are
 * read in the browser and listed for checking; nothing is stored until "Import" is pressed,
 * and then only the sender, subject, date and text are sent, never the file or attachments.
 */
export function ImportForm({ clients }: { clients: { id: string; name: string; code: string }[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [defaultClient, setDefaultClient] = useState(clients[0]?.id ?? "");
  const { words } = useDesk();
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  // Where the emails come from: chosen in the person's own mailbox, or saved files dropped here.
  const canConnect = mailboxMode() !== "off";
  const [source, setSource] = useState<"mailbox" | "files">(canConnect ? "mailbox" : "files");

  // An email that failed to import stays in the list and goes again with the next press.
  const settled = (r: Row) => r.result?.status === "imported" || r.result?.status === "duplicate";
  const done = rows.length > 0 && rows.every((r) => settled(r) || r.problem);
  const ready = rows.filter((r) => !r.problem && !settled(r));
  const imported = rows.filter((r) => r.result?.status === "imported").length;

  async function addFiles(files: File[]) {
    setError(null);
    setNote(null);
    if (files.length === 0) return;
    setReading(true);
    // The parsers are only fetched when someone actually imports.
    const { parseEmailFile } = await import("@/lib/inbox/parse-email");
    const notes: string[] = [];
    const room = LIMIT - rows.filter((r) => !settled(r)).length;
    if (files.length > room) notes.push(`Only ${LIMIT} emails can be imported at a time; ${files.length - Math.max(room, 0)} were left out.`);
    const added: Row[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (file.size > MAX_FILE_BYTES) {
        notes.push(`${file.name} is over 30 MB and was left out.`);
        continue;
      }
      const parsed = await parseEmailFile(file.name, await file.arrayBuffer());
      added.push({ ...parsed, key: `${file.name}:${file.size}:${file.lastModified}`, organisationId: defaultClient });
    }
    // Emails already imported this visit leave the list; the database is what knows whether
    // one of those is a repeat, and it answers "Already in the inbox". The same email
    // dropped twice while still waiting shows once.
    const waiting = rows.filter((r) => !settled(r));
    const seen = new Set(waiting.map((r) => r.messageId).filter(Boolean));
    const fresh = added.filter((r) => {
      if (r.problem || !r.messageId) return true;
      if (seen.has(r.messageId)) return false;
      seen.add(r.messageId);
      return true;
    });
    const repeats = added.length - fresh.length;
    if (repeats > 0) notes.push(`${repeats} ${repeats === 1 ? "email was" : "emails were"} already in the list.`);
    setRows([...waiting, ...fresh]);
    setNote(notes.length ? notes.join(" ") : null);
    setReading(false);
  }

  function runImport() {
    setError(null);
    const sending = ready;
    startTransition(async () => {
      const out = await importEmails(
        sending.map((r) => ({
          organisationId: r.organisationId,
          fromName: r.fromName,
          fromEmail: r.fromEmail,
          subject: r.subject,
          body: r.body,
          receivedAt: r.receivedAt,
          messageId: r.messageId,
        })),
      );
      if (out.error) {
        setError(out.error);
        return;
      }
      setRows((current) => current.map((r) => {
        const i = sending.findIndex((s) => s.key === r.key);
        return i >= 0 ? { ...r, result: out.results[i] } : r;
      }));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {canConnect && (
        <div role="group" aria-label="Where the emails come from" className="flex w-fit rounded-lg border border-border bg-muted/40 p-0.5">
          {(
            [
              ["mailbox", "From my mailbox"],
              ["files", "From saved files"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={source === key}
              onClick={() => setSource(key)}
              className={cn("rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", source === key ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Kept mounted while the files tab shows, so the list and what was ticked are not lost. */}
      {canConnect && (
        <div className={cn(source !== "mailbox" && "hidden")}>
          <MailboxPicker room={LIMIT - rows.filter((r) => !settled(r)).length} onAdd={addFiles} />
        </div>
      )}

      <div className={cn("grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]", source !== "files" && "hidden")}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void addFiles(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center",
            over ? "border-primary bg-accent/60" : "border-input bg-card",
          )}
        >
          <FileUp className="size-7 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">Drop saved emails here</p>
            <p className="mt-1 text-sm text-muted-foreground">.eml files from any mail program, or .msg files from Outlook. Up to {LIMIT} at a time.</p>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook"
            className="sr-only"
            aria-label="Choose saved email files"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="lg" onClick={() => input.current?.click()} disabled={reading || pending}>
            {reading ? "Reading…" : "Choose files"}
          </Button>
        </div>

        <div className="surface p-5 text-sm">
          <h2 className="font-semibold">How to get emails out of your mailbox</h2>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="font-medium">Outlook on Windows (classic)</dt>
              <dd className="text-muted-foreground">Select the emails and drag them straight onto the box, or drag them to a folder first; each becomes a .msg file.</dd>
            </div>
            <div>
              <dt className="font-medium">New Outlook and Outlook on the web</dt>
              <dd className="text-muted-foreground">Open the email, choose the three dots, then “Save as” or “Download”; you get an .eml file.</dd>
            </div>
            <div>
              <dt className="font-medium">Gmail</dt>
              <dd className="text-muted-foreground">Open the email, choose the three dots, then “Download message”.</dd>
            </div>
            <div>
              <dt className="font-medium">Apple Mail and Thunderbird</dt>
              <dd className="text-muted-foreground">Drag the emails to a folder; each becomes an .eml file.</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Files are read in your browser. Only the sender, subject, date and text are stored; the file itself and any attachments stay on your computer.
          </p>
        </div>
      </div>

      {words.hasClients && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="default-client" className="text-sm font-medium">
            Sent to
          </label>
          <select
            id="default-client"
            className={selectClass}
            value={defaultClient}
            onChange={(e) => {
              setDefaultClient(e.target.value);
              // Changing it here sets every email not yet imported; each row can still differ.
              setRows((current) => current.map((r) => (settled(r) ? r : { ...r, organisationId: e.target.value })));
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">The client these emails were sent to. Change one email below if it belongs to another client.</p>
        </div>
      )}

      {note && <p className="text-sm text-warn-fg">{note}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Not imported</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rows.length > 0 && (
        <>
          <div className="surface overflow-x-auto">
            <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Emails ready to import</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(th, "pl-5")}>From</th>
                  <th scope="col" className={cn(th, "w-full")}>Subject and first lines</th>
                  <th scope="col" className={th}>Received</th>
                  {words.hasClients && <th scope="col" className={th}>Sent to</th>}
                  <th scope="col" className={th}>State</th>
                  <th scope="col" className={cn(th, "pr-4")}>
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={cn(r.problem && "bg-muted/40")}>
                    <td className={cn(td, "max-w-[16rem] pl-5")}>
                      <span className="block truncate font-medium">{r.fromName || r.fromEmail || <span className="font-normal text-muted-foreground">Unknown sender</span>}</span>
                      {r.fromName && r.fromEmail && <span className="block truncate text-xs text-muted-foreground">{r.fromEmail}</span>}
                    </td>
                    <td className={cn(td, "max-w-0")}>
                      <span className="block truncate">{r.subject || <span className="text-muted-foreground">{r.problem ? r.fileName : "(no subject)"}</span>}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.body.slice(0, 160)}</span>
                    </td>
                    <td className={cn(td, "whitespace-nowrap tabular-nums")}>
                      {r.receivedAt ? shortDate(londonDate(r.receivedAt)) : r.problem ? "" : <span className="text-warn-fg" title="This file has no date, so the item will be dated today. Correct the date when you accept it.">Today (no date in file)</span>}
                    </td>
                    {words.hasClients && (
                      <td className={td}>
                        {!r.problem && !settled(r) && (
                          <select
                            aria-label={`Client for the email from ${r.fromName || r.fromEmail || "unknown sender"}`}
                            className={selectClass}
                            value={r.organisationId}
                            onChange={(e) => setRows((current) => current.map((x) => (x.key === r.key ? { ...x, organisationId: e.target.value } : x)))}
                          >
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {settled(r) && clients.find((c) => c.id === r.organisationId)?.name}
                      </td>
                    )}
                    <td className={cn(td, "min-w-52 whitespace-nowrap")}>
                      {r.result ? (
                        r.result.status === "imported" ? (
                          <Tag tone="ok">In the inbox</Tag>
                        ) : r.result.status === "duplicate" ? (
                          <Tag tone="neutral">Already in the inbox</Tag>
                        ) : (
                          <span className="whitespace-normal text-danger-fg">Not imported: {r.result.message}</span>
                        )
                      ) : r.problem ? (
                        <span className="whitespace-normal text-danger-fg">{r.problem}</span>
                      ) : (
                        <>
                          <Tag tone="info">Ready</Tag>
                          {r.cut && <span className="ml-2 text-xs text-warn-fg">Long text was cut</span>}
                        </>
                      )}
                    </td>
                    <td className={cn(td, "py-1.5 pr-4")}>
                      {!settled(r) && (
                        <button
                          type="button"
                          onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
                          disabled={pending}
                          title="Leave this one out"
                          aria-label={`Leave out the email from ${r.fromName || r.fromEmail || r.fileName}`}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {ready.length > 0 && (
              <Button type="button" size="lg" onClick={runImport} disabled={pending || reading}>
                {pending ? "Importing and triaging…" : `${ready.some((r) => r.result) ? "Try again: import" : "Import"} ${ready.length} ${ready.length === 1 ? "email" : "emails"} into the inbox`}
              </Button>
            )}
            {done && imported > 0 && (
              <Button size="lg" render={<Link href="/inbox" />} nativeButton={false}>
                Go to the inbox
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            )}
            {!done && (
              <p className="text-sm text-muted-foreground">
                Each email lands in the inbox, triaged, dated the day it arrived. Nothing becomes a case until you accept it there.
              </p>
            )}
            {done && <p className="text-sm text-muted-foreground">{imported} imported. Drop more emails above to carry on.</p>}
          </div>
        </>
      )}
    </div>
  );
}
