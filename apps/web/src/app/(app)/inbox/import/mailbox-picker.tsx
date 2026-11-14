"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mailbox as MailboxIcon, Paperclip, RefreshCw } from "lucide-react";
import { mailboxMessage, useMailbox } from "@/components/mailbox/use-mailbox";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { shortDate } from "@/lib/clocks";
import type { Mailbox, MailboxMessage } from "@/lib/mailbox/types";
import { londonDate } from "@/lib/today";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 7 * 24 },
  { key: "30d", label: "Last 30 days", hours: 30 * 24 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"] | "dates";

const th = "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "border-b border-border px-3 py-2 align-top";
const dateInput = cn("h-8 rounded-lg border border-input bg-card px-2 text-sm tabular-nums", "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none");

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
/** A file name a person would recognise if they saw it in the list below. */
const fileName = (m: MailboxMessage) => `${(m.subject ?? "No subject").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 80) || "Email"}.eml`;

/**
 * The person's own inbox, listed here so emails can be chosen instead of saved and dropped.
 * The list is read by the browser straight from the mailbox; nothing reaches Privacy Desk
 * until the chosen emails are added to the import list and "Import" is pressed there.
 */
export function MailboxPicker({ room, onAdd }: { /** How many more emails the import list can take. */ room: number; onAdd: (files: File[]) => Promise<void> }) {
  const { mode, mailbox, checking, connecting, error: connectError, connect, disconnect } = useMailbox();
  const [range, setRange] = useState<RangeKey>("24h");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which load is current, so a slow answer for an earlier period is ignored.
  const turn = useRef(0);

  const period = useCallback((): { since: string; until: string | null } | null => {
    if (range === "dates") {
      if (!from) return null;
      // Whole days as the person's own clock has them.
      return { since: new Date(`${from}T00:00:00`).toISOString(), until: to ? new Date(`${to}T23:59:59`).toISOString() : null };
    }
    const hours = RANGES.find((r) => r.key === range)?.hours ?? 24;
    return { since: new Date(Date.now() - hours * 3_600_000).toISOString(), until: null };
  }, [range, from, to]);

  const load = useCallback(
    async (box: Mailbox, more: string | null) => {
      const p = period();
      if (!p) return;
      const mine = ++turn.current;
      setLoading(true);
      setError(null);
      try {
        const page = await box.listInbox(p, more);
        if (mine !== turn.current) return;
        setMessages((current) => (more ? [...current, ...page.messages] : page.messages));
        setNext(page.next);
        if (!more) setPicked(new Set());
      } catch (e) {
        if (mine === turn.current) setError(mailboxMessage(e));
      } finally {
        if (mine === turn.current) setLoading(false);
      }
    },
    [period],
  );

  // List the inbox as soon as a mailbox is connected, and again whenever the period changes.
  useEffect(() => {
    if (!mailbox) return;
    const t = setTimeout(() => void load(mailbox, null), 0);
    return () => clearTimeout(t);
  }, [mailbox, load]);

  if (mode === "off") return null;

  const choosable = messages.filter((m) => !added.has(m.id));
  const allPicked = choosable.length > 0 && choosable.every((m) => picked.has(m.id));
  const toggle = (id: string) =>
    setPicked((current) => {
      const copy = new Set(current);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });

  async function addPicked() {
    if (!mailbox) return;
    const chosen = messages.filter((m) => picked.has(m.id)).slice(0, Math.max(room, 0));
    if (chosen.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const files: File[] = [];
      for (const m of chosen) {
        // Each email exactly as it was delivered, so it is read the same way as a saved file.
        const bytes = await mailbox.mime(m.id);
        files.push(new File([bytes], fileName(m), { type: "message/rfc822", lastModified: Date.parse(m.receivedAt) || Date.now() }));
      }
      await onAdd(files);
      setAdded((current) => new Set([...current, ...chosen.map((m) => m.id)]));
      setPicked(new Set());
    } catch (e) {
      setError(mailboxMessage(e));
    } finally {
      setAdding(false);
    }
  }

  if (!mailbox) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-8 text-center">
        <MailboxIcon className="size-7 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium">Choose emails straight from your mailbox</p>
          <p className="mx-auto mt-1 max-w-[60ch] text-sm text-muted-foreground">
            {mode === "sample"
              ? "This desk is set to a sample mailbox with made-up emails, so the screens can be tried. Nothing is read from a real mailbox."
              : "Connect your Microsoft 365 or Outlook.com mailbox and your inbox is listed here to choose from. Microsoft asks you in its own window; your browser is given leave to read your mail, and Privacy Desk's server never is."}
          </p>
        </div>
        <Button type="button" size="lg" onClick={() => void connect("read")} disabled={checking || connecting}>
          {checking ? "Checking…" : connecting ? "Waiting for Microsoft's window…" : mode === "sample" ? "Connect the sample mailbox" : "Connect my mailbox"}
        </Button>
        {connectError && (
          <p className="text-sm text-destructive" role="alert">
            {connectError}
          </p>
        )}
      </div>
    );
  }

  const pickedCount = [...picked].filter((id) => messages.some((m) => m.id === id)).length;

  return (
    <div className="surface flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <MailboxIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">
            Inbox of <span className="font-medium">{mailbox.account.address}</span>
          </span>
          {mailbox.account.sample && <Tag tone="info">Sample, made-up emails</Tag>}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div role="group" aria-label="Emails received in" className="flex rounded-lg border border-border bg-muted/40 p-0.5">
          {[...RANGES, { key: "dates" as const, label: "Between dates" }].map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn("rounded-md px-2.5 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", range === r.key ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "dates" && (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="mail-from" className="text-muted-foreground">
              From
            </label>
            <input id="mail-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
            <label htmlFor="mail-to" className="text-muted-foreground">
              to
            </label>
            <input id="mail-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateInput} />
          </span>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={loading} onClick={() => void load(mailbox, null)}>
          <RefreshCw data-icon="inline-start" className={cn(loading && "animate-spin")} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="border-b border-border px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="max-h-[26rem] min-h-32 overflow-auto">
        {range === "dates" && !from ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Choose the first day to list emails from.</p>
        ) : messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground" role="status">
            {loading ? "Reading your inbox…" : "No emails arrived in this period."}
          </p>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Emails in your inbox for the chosen period, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(th, "w-10 pl-4")}>
                  <input
                    type="checkbox"
                    aria-label="Choose all the emails shown"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(choosable.map((m) => m.id)))}
                    className="size-4 accent-primary"
                  />
                </th>
                <th scope="col" className={th}>From</th>
                <th scope="col" className={cn(th, "w-full")}>Subject and first lines</th>
                <th scope="col" className={cn(th, "pr-4")}>Received</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => {
                const done = added.has(m.id);
                const on = picked.has(m.id);
                const who = m.fromName || m.fromEmail || "Unknown sender";
                return (
                  <tr key={m.id} className={cn(on && "bg-accent/50", done && "text-muted-foreground")}>
                    <td className={cn(td, "pl-4")}>
                      <input type="checkbox" aria-label={`Choose the email from ${who}: ${m.subject ?? "no subject"}`} checked={on} disabled={done} onChange={() => toggle(m.id)} className="size-4 accent-primary" />
                    </td>
                    <td className={cn(td, "max-w-[14rem]")}>
                      <span className="block truncate font-medium">{who}</span>
                      {m.fromName && m.fromEmail && <span className="block truncate text-xs text-muted-foreground">{m.fromEmail}</span>}
                    </td>
                    <td className={cn(td, "max-w-0")}>
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{m.subject ?? <span className="text-muted-foreground">(no subject)</span>}</span>
                        {m.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments, which are not imported" />}
                        {done && <Tag tone="ok">Added below</Tag>}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{m.preview}</span>
                    </td>
                    <td className={cn(td, "whitespace-nowrap pr-4 tabular-nums text-muted-foreground")}>
                      {m.receivedAt ? `${shortDate(londonDate(m.receivedAt))}, ${time(m.receivedAt)}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3">
        <Button type="button" size="lg" disabled={pickedCount === 0 || adding || room <= 0} onClick={() => void addPicked()}>
          {adding ? "Fetching the emails…" : pickedCount === 0 ? "Add to the import list" : `Add ${Math.min(pickedCount, Math.max(room, 0))} to the import list`}
        </Button>
        {next && (
          <Button type="button" variant="outline" size="lg" disabled={loading} onClick={() => void load(mailbox, next)}>
            Show older emails
          </Button>
        )}
        <p className="min-w-0 flex-1 text-xs text-muted-foreground" role="status">
          {room <= 0
            ? "The import list below is full. Import those first."
            : pickedCount > room
              ? `Only ${room} more can go in the list at a time; the first ${room} chosen will be added.`
              : "Your browser reads this list straight from your mailbox. Nothing reaches Privacy Desk until you press Import below, and then only the sender, subject, date and text of the emails you chose."}
        </p>
      </div>
    </div>
  );
}
