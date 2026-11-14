// Connecting a person's mailbox, in their browser. Microsoft's own sign-in library asks the
// person, in a pop-up window on Microsoft's site, to let this browser read their mail and send
// as them. What comes back is kept in this browser tab's session storage, so it is gone when
// the browser closes, and it is never sent to Privacy Desk's server.
//
// Leave is asked for in two steps, each only when it is first needed: reading (to list and
// import emails), then writing and sending (to reply from a case).
import type { IPublicClientApplication } from "@azure/msal-browser";
import { graphMailbox, type Leave } from "./graph";
import { sampleMailbox } from "./sample";
import { MailboxError, type Mailbox } from "./types";

export type MailboxMode = "microsoft" | "sample" | "off";

/** Whether this deployment can connect a mailbox: a real Microsoft one, the made-up one in development, or none. */
export function mailboxMode(): MailboxMode {
  if (process.env.NEXT_PUBLIC_MS_CLIENT_ID) return "microsoft";
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MAILBOX_SAMPLE === "1") return "sample";
  return "off";
}

const SCOPES: Record<Leave, string[]> = {
  read: ["Mail.Read"],
  write: ["Mail.ReadWrite", "Mail.Send"],
};

/** The page Microsoft sends the pop-up back to; it only hands the answer to this window (app/mailbox-redirect). */
const redirectUri = () => `${window.location.origin}/mailbox-redirect`;

let app: Promise<IPublicClientApplication> | null = null;

/** Microsoft's library, loaded only when someone actually connects a mailbox. */
function microsoft(): Promise<IPublicClientApplication> {
  app ??= (async () => {
    const { PublicClientApplication } = await import("@azure/msal-browser");
    const pca = new PublicClientApplication({
      auth: {
        clientId: process.env.NEXT_PUBLIC_MS_CLIENT_ID ?? "",
        // "common" takes work and personal Microsoft accounts; a tenant id limits it to one organisation.
        authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_MS_TENANT || "common"}`,
        redirectUri: redirectUri(),
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await pca.initialize();
    return pca;
  })();
  return app;
}

/** Microsoft's failures, in words that say what to do. */
function explain(e: unknown): MailboxError {
  if (e instanceof MailboxError) return e;
  const code = String((e as { errorCode?: string } | null)?.errorCode ?? "");
  if (code === "popup_window_error" || code === "empty_window_error") {
    return new MailboxError("Your browser blocked the Microsoft sign-in window. Allow pop-ups for this site, then try again.", "blocked");
  }
  if (code === "user_cancelled" || code === "timed_out" || code === "access_denied") {
    return new MailboxError("The Microsoft sign-in was not finished. Try again when you are ready.", "cancelled");
  }
  if (code === "interaction_in_progress") {
    return new MailboxError("A Microsoft sign-in window is already open. Finish it, or close it and try again.", "cancelled");
  }
  if (code === "consent_required" || code === "invalid_grant" || code === "interaction_required" || code === "login_required") {
    return new MailboxError("The mailbox needs you to sign in again.", "sign-in");
  }
  return new MailboxError(`The mailbox could not be connected${code ? ` (Microsoft said: ${code})` : ""}. Try again.`, "other");
}

async function microsoftMailbox(pca: IPublicClientApplication): Promise<Mailbox | null> {
  const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
  if (!account) return null;
  pca.setActiveAccount(account);

  async function token(leave: Leave): Promise<string> {
    const scopes = SCOPES[leave];
    try {
      return (await pca.acquireTokenSilent({ scopes, account: account ?? undefined })).accessToken;
    } catch {
      // Leave not yet given for this (or it has run out): ask in Microsoft's window.
      try {
        return (await pca.acquireTokenPopup({ scopes, account: account ?? undefined, redirectUri: redirectUri(), overrideInteractionInProgress: true })).accessToken;
      } catch (e) {
        throw explain(e);
      }
    }
  }
  return graphMailbox({ address: account.username.toLowerCase(), name: account.name ?? null, sample: false }, token);
}

const SAMPLE_FLAG = "pd_sample_mailbox_connected";

/** The mailbox already connected in this browser session, without asking anything; null when there is none. */
export async function resumeMailbox(): Promise<Mailbox | null> {
  const mode = mailboxMode();
  if (mode === "sample") return sessionStorage.getItem(SAMPLE_FLAG) ? sampleMailbox() : null;
  if (mode !== "microsoft") return null;
  try {
    return await microsoftMailbox(await microsoft());
  } catch {
    return null;
  }
}

/** Ask the person to connect their mailbox. Must be called from a click, or the browser blocks the window. */
export async function connectMailbox(leave: Leave): Promise<Mailbox> {
  const mode = mailboxMode();
  if (mode === "sample") {
    sessionStorage.setItem(SAMPLE_FLAG, "1");
    return sampleMailbox();
  }
  if (mode !== "microsoft") throw new MailboxError("Connecting a mailbox is not switched on for this desk.", "other");
  try {
    const pca = await microsoft();
    const result = await pca.loginPopup({ scopes: SCOPES[leave], prompt: "select_account", redirectUri: redirectUri(), overrideInteractionInProgress: true });
    pca.setActiveAccount(result.account);
    const mailbox = await microsoftMailbox(pca);
    if (!mailbox) throw new MailboxError("Microsoft signed you in but gave no mailbox. Try again.", "other");
    return mailbox;
  } catch (e) {
    throw explain(e);
  }
}

/** Forget the mailbox in this browser. Nothing is held anywhere else, so this ends Privacy Desk's use of it. */
export async function disconnectMailbox(): Promise<void> {
  const mode = mailboxMode();
  if (mode === "sample") {
    sessionStorage.removeItem(SAMPLE_FLAG);
    return;
  }
  if (mode !== "microsoft") return;
  const pca = await microsoft();
  await pca.clearCache({ account: pca.getActiveAccount() });
  pca.setActiveAccount(null);
}
