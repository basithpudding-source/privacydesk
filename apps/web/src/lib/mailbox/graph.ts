// A Microsoft 365 or Outlook.com mailbox, through Microsoft Graph. Runs in the browser with
// the permission the person granted to their own browser (see connect.ts); nothing here goes
// through Privacy Desk's server.
//
// The requests follow Microsoft's documentation for the v1.0 mail API:
//   list      GET  /me/mailFolders/inbox/messages   ($filter and $orderby must name the same property)
//   as sent   GET  /me/messages/{id}/$value          (the email in MIME, as a saved .eml file holds it)
//   reply     POST /me/messages/{id}/createReply     then PATCH the draft; or POST /me/messages for a new one
//   attach    POST /me/messages/{id}/attachments     (under 3 MB each)
//   send      POST /me/messages/{id}/send            (202; the copy is saved in Sent Items)
// Every request asks for ids that stay the same when a message moves folder, so a draft can
// be found again after it has been sent.
import { MailboxError, type DraftRef, type DraftStatus, type Mailbox, type MailboxAccount, type MailboxMessage, type ReplyInput } from "./types";

export const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const LIST_FIELDS = "id,subject,from,receivedDateTime,bodyPreview,hasAttachments";
export const PAGE_SIZE = 50;

/** What a request needs leave to do: reading the inbox, or writing and sending a reply. */
export type Leave = "read" | "write";

/** Dates in a Graph filter are written without quotes and without fractions of a second. */
function graphDate(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function query(parts: Record<string, string>): string {
  // The "$" of an option name is left as it is; only the values are encoded.
  return Object.entries(parts)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/** The address of the inbox list for a period, newest first. */
export function inboxUrl(range: { since: string; until?: string | null }, top = PAGE_SIZE): string {
  const filter = [`receivedDateTime ge ${graphDate(range.since)}`, range.until ? `receivedDateTime le ${graphDate(range.until)}` : null].filter(Boolean).join(" and ");
  return `${GRAPH_ROOT}/me/mailFolders/inbox/messages?${query({ $select: LIST_FIELDS, $filter: filter, $orderby: "receivedDateTime desc", $top: String(top) })}`;
}

/** The address that finds the email with a given Message-ID. A quote inside the id is doubled, as OData asks. */
export function findByMessageIdUrl(messageId: string): string {
  return `${GRAPH_ROOT}/me/messages?${query({ $filter: `internetMessageId eq '${messageId.replace(/'/g, "''")}'`, $select: "id", $top: "1" })}`;
}

interface GraphAddress {
  emailAddress?: { name?: string | null; address?: string | null } | null;
}
interface GraphMessage {
  id: string;
  subject?: string | null;
  from?: GraphAddress | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  bodyPreview?: string | null;
  hasAttachments?: boolean | null;
  isDraft?: boolean | null;
  webLink?: string | null;
  toRecipients?: GraphAddress[] | null;
}

export function toMessage(m: GraphMessage): MailboxMessage {
  return {
    id: m.id,
    subject: m.subject?.trim() || null,
    fromName: m.from?.emailAddress?.name?.trim() || null,
    fromEmail: m.from?.emailAddress?.address?.trim().toLowerCase() || null,
    receivedAt: m.receivedDateTime ?? "",
    preview: (m.bodyPreview ?? "").replace(/\s+/g, " ").trim(),
    hasAttachments: Boolean(m.hasAttachments),
  };
}

/** Only a link to Outlook itself is ever offered to the person. */
export function safeWebLink(link: string | null | undefined): string | null {
  try {
    const u = new URL(link ?? "");
    return u.protocol === "https:" && /(^|\.)(office\.com|office365\.com|live\.com|outlook\.com|microsoft\.com)$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  // In pieces, so a large file does not overflow the call that turns bytes into characters.
  for (let i = 0; i < view.length; i += 0x8000) out += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(out);
}

async function problemFrom(res: Response): Promise<MailboxError> {
  let code = "";
  try {
    code = String(((await res.json()) as { error?: { code?: string } }).error?.code ?? "");
  } catch {
    // Not every failure comes with a body.
  }
  const said = code ? ` (Microsoft said: ${code}.)` : "";
  if (res.status === 401) return new MailboxError(`Your mailbox connection has run out. Connect the mailbox again.${said}`, "sign-in");
  if (res.status === 403) return new MailboxError(`The mailbox refused. Your organisation may need to approve Privacy Desk before it can be used with this mailbox.${said}`, "permission");
  if (res.status === 404) return new MailboxError(`That email is no longer in the mailbox.${said}`, "not-found");
  if (res.status === 429 || res.status === 503 || res.status === 504) return new MailboxError(`The mailbox is busy. Wait a minute and try again.${said}`, "busy");
  return new MailboxError(`The mailbox could not do that.${said}`, "other");
}

/**
 * A mailbox over Microsoft Graph. `token` gives a fresh permission for reading or for writing;
 * `request` is the browser's fetch (passed in so the requests can be tested without a mailbox).
 */
export function graphMailbox(account: MailboxAccount, token: (leave: Leave) => Promise<string>, request: typeof fetch = fetch): Mailbox {
  async function call(leave: Leave, method: string, url: string, body?: unknown): Promise<Response> {
    // The permission is only ever sent to Microsoft Graph, whatever address a response hands back.
    if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new MailboxError("The mailbox gave an address that is not Microsoft's, so it was not followed.", "other");
    let res: Response;
    try {
      res = await request(url, {
        method,
        headers: {
          Authorization: `Bearer ${await token(leave)}`,
          Prefer: 'IdType="ImmutableId"',
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (e instanceof MailboxError) throw e;
      throw new MailboxError("The mailbox could not be reached. Check your connection and try again.", "busy");
    }
    if (!res.ok) throw await problemFrom(res);
    return res;
  }
  const json = async <T>(leave: Leave, method: string, url: string, body?: unknown) => (await (await call(leave, method, url, body)).json()) as T;
  const at = (id: string) => `${GRAPH_ROOT}/me/messages/${encodeURIComponent(id)}`;

  return {
    account,

    async listInbox(range, next) {
      const page = await json<{ value?: GraphMessage[]; "@odata.nextLink"?: string }>("read", "GET", next ?? inboxUrl(range));
      return { messages: (page.value ?? []).map(toMessage), next: page["@odata.nextLink"] ?? null };
    },

    async mime(id) {
      return (await call("read", "GET", `${at(id)}/$value`)).arrayBuffer();
    },

    async saveDraft(input: ReplyInput): Promise<DraftRef> {
      const content = {
        subject: input.subject,
        body: { contentType: "Text", content: input.body },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
      };
      // As a reply to the original when it is in this mailbox, so it joins the conversation.
      let original: string | null = null;
      if (input.inReplyTo) {
        const found = await json<{ value?: { id: string }[] }>("write", "GET", findByMessageIdUrl(input.inReplyTo));
        original = found.value?.[0]?.id ?? null;
      }
      let draft: GraphMessage;
      if (original) {
        const reply = await json<GraphMessage>("write", "POST", `${at(original)}/createReply`);
        draft = await json<GraphMessage>("write", "PATCH", at(reply.id), content);
      } else {
        draft = await json<GraphMessage>("write", "POST", `${GRAPH_ROOT}/me/messages`, content);
      }
      try {
        for (const a of input.attachments) {
          await call("write", "POST", `${at(draft.id)}/attachments`, {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.name,
            contentType: a.type || "application/octet-stream",
            contentBytes: base64(a.bytes),
          });
        }
      } catch (e) {
        // A draft missing an attachment must not be left looking finished.
        await call("write", "DELETE", at(draft.id)).catch(() => undefined);
        throw e;
      }
      return { id: draft.id, webLink: safeWebLink(draft.webLink), threaded: Boolean(original) };
    },

    async send(draftId) {
      await call("write", "POST", `${at(draftId)}/send`);
    },

    async status(draftId): Promise<DraftStatus> {
      let m: GraphMessage;
      try {
        // With the leave the reply was written under, so checking never asks for a second permission.
        m = await json<GraphMessage>("write", "GET", `${at(draftId)}?${query({ $select: "id,isDraft,sentDateTime,subject,toRecipients,hasAttachments" })}`);
      } catch (e) {
        if (e instanceof MailboxError && e.problem === "not-found") return { state: "gone" };
        throw e;
      }
      // A draft carries a "sent" time too, so only isDraft says whether it has gone.
      if (m.isDraft !== false) return { state: "draft" };
      let attachments: string[] = [];
      if (m.hasAttachments) {
        const list = await json<{ value?: { name?: string | null }[] }>("write", "GET", `${at(draftId)}/attachments?${query({ $select: "name" })}`);
        attachments = (list.value ?? []).map((a) => a.name ?? "").filter(Boolean);
      }
      return {
        state: "sent",
        sentAt: m.sentDateTime ?? new Date().toISOString(),
        to: (m.toRecipients ?? []).map((r) => r.emailAddress?.address?.toLowerCase() ?? "").filter(Boolean),
        subject: m.subject ?? "",
        attachments,
      };
    },
  };
}
