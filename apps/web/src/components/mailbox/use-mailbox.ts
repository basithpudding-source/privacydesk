"use client";

import { useCallback, useEffect, useState } from "react";
import { connectMailbox, disconnectMailbox, mailboxMode, resumeMailbox } from "@/lib/mailbox/connect";
import type { Leave } from "@/lib/mailbox/graph";
import { MailboxError, type Mailbox } from "@/lib/mailbox/types";

/** What went wrong, in words for the person; anything unexpected gets a plain fallback. */
export function mailboxMessage(e: unknown): string {
  return e instanceof MailboxError ? e.message : "The mailbox could not do that. Try again.";
}

/**
 * The person's mailbox as this browser knows it: whether one can be connected here at all,
 * the one already connected in this browser session, and the buttons to connect or forget it.
 */
export function useMailbox() {
  const mode = mailboxMode();
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [checking, setChecking] = useState(mode !== "off");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A mailbox connected earlier in this browser session is picked up without asking again.
  useEffect(() => {
    if (mode === "off") return;
    let live = true;
    resumeMailbox().then((m) => {
      if (!live) return;
      setMailbox(m);
      setChecking(false);
    });
    return () => {
      live = false;
    };
  }, [mode]);

  /** Must be called straight from a click, so the browser allows Microsoft's window to open. */
  const connect = useCallback(async (leave: Leave): Promise<Mailbox | null> => {
    setError(null);
    setConnecting(true);
    try {
      const m = await connectMailbox(leave);
      setMailbox(m);
      return m;
    } catch (e) {
      setError(mailboxMessage(e));
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    await disconnectMailbox().catch(() => undefined);
    setMailbox(null);
  }, []);

  return { mode, mailbox, checking, connecting, error, connect, disconnect };
}
