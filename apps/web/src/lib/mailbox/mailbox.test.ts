// The mailbox code never runs against a real mailbox here. Microsoft's service is replaced by
// a stand-in that records each request and answers as the documentation says it does.
import { describe, expect, test } from "vitest";
import { checkRecipient, evidenceLine } from "@/lib/cases/evidence";
import { parseEmailFile } from "@/lib/inbox/parse-email";
import { findByMessageIdUrl, GRAPH_ROOT, graphMailbox, inboxUrl, safeWebLink, toMessage } from "./graph";
import { parsePending, sentRecord, stepNeeds, type PendingLetter } from "./pending";
import { sampleMailbox } from "./sample";
import { asMessageId, MailboxError, splitRecipients, type MailboxAccount } from "./types";

const account: MailboxAccount = { address: "alex.carter@consultancy.example", name: "Alex Carter", sample: false };

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A stand-in for Microsoft Graph: answers each request from a list of routes and keeps what was asked. */
function standIn(routes: (call: Call) => { status?: number; json?: unknown; text?: string } | undefined) {
  const calls: Call[] = [];
  const request = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const out = routes(call) ?? { status: 404, json: { error: { code: "ErrorItemNotFound" } } };
    return new Response(out.text ?? (out.json === undefined ? null : JSON.stringify(out.json)), { status: out.status ?? 200 });
  }) as typeof fetch;
  const leaves: string[] = [];
  const mailbox = graphMailbox(account, async (leave) => (leaves.push(leave), `token-for-${leave}`), request);
  return { mailbox, calls, leaves };
}

describe("asking Microsoft for the inbox", () => {
  test("lists a period newest first, filtering and ordering by the same field as Microsoft requires", () => {
    const url = inboxUrl({ since: "2026-11-13T09:30:15.123Z" });
    expect(url.startsWith(`${GRAPH_ROOT}/me/mailFolders/inbox/messages?`)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("$filter")).toBe("receivedDateTime ge 2026-11-13T09:30:15Z");
    expect(q.get("$orderby")).toBe("receivedDateTime desc");
    expect(q.get("$top")).toBe("50");
    expect(q.get("$select")).not.toContain("body,");
    expect(new URL(inboxUrl({ since: "2026-11-01T00:00:00Z", until: "2026-11-07T23:59:59Z" })).searchParams.get("$filter")).toBe(
      "receivedDateTime ge 2026-11-01T00:00:00Z and receivedDateTime le 2026-11-07T23:59:59Z",
    );
  });

  test("looks an email up by its Message-ID, with a quote in it made safe", () => {
    expect(new URL(findByMessageIdUrl("<o'brien-1@example.com>")).searchParams.get("$filter")).toBe("internetMessageId eq '<o''brien-1@example.com>'");
  });

  test("turns Microsoft's message into what the list shows", () => {
    expect(
      toMessage({ id: "m1", subject: " Copy of my records ", from: { emailAddress: { name: "Rosa Vega", address: "Rosa.Vega@Example.com" } }, receivedDateTime: "2026-11-13T09:00:00Z", bodyPreview: "Please  send\nme a copy", hasAttachments: true }),
    ).toEqual({ id: "m1", subject: "Copy of my records", fromName: "Rosa Vega", fromEmail: "rosa.vega@example.com", receivedAt: "2026-11-13T09:00:00Z", preview: "Please send me a copy", hasAttachments: true });
    expect(toMessage({ id: "m2" })).toMatchObject({ subject: null, fromName: null, fromEmail: null, preview: "" });
  });

  test("sends the permission to read, asks for ids that survive a move, and follows the next page", async () => {
    const { mailbox, calls, leaves } = standIn((c) =>
      c.url.includes("mailFolders/inbox")
        ? { json: { value: [{ id: "m1", subject: "One" }], "@odata.nextLink": `${GRAPH_ROOT}/me/mailFolders/inbox/messages?$skip=50` } }
        : undefined,
    );
    const first = await mailbox.listInbox({ since: "2026-11-13T00:00:00Z" });
    expect(first.messages.map((m) => m.id)).toEqual(["m1"]);
    expect(calls[0].headers.Authorization).toBe("Bearer token-for-read");
    expect(calls[0].headers.Prefer).toBe('IdType="ImmutableId"');
    await mailbox.listInbox({ since: "2026-11-13T00:00:00Z" }, first.next);
    expect(calls[1].url).toBe(first.next);
    expect(leaves).toEqual(["read", "read"]);
  });

  test("never sends the permission anywhere but Microsoft's mail service", async () => {
    const { mailbox, calls } = standIn(() => ({ json: { value: [] } }));
    await expect(mailbox.listInbox({ since: "2026-11-13T00:00:00Z" }, "https://graph.microsoft.com.evil.example/v1.0/me/messages")).rejects.toBeInstanceOf(MailboxError);
    await expect(mailbox.listInbox({ since: "2026-11-13T00:00:00Z" }, "https://evil.example/steal")).rejects.toBeInstanceOf(MailboxError);
    expect(calls).toHaveLength(0);
  });

  test("fetches one email as delivered", async () => {
    const { mailbox, calls } = standIn((c) => (c.url.endsWith("/$value") ? { text: "From: a@example.com\r\n\r\nHello" } : undefined));
    expect(new TextDecoder().decode(await mailbox.mime("AAMk/id+1="))).toContain("Hello");
    expect(calls[0].url).toBe(`${GRAPH_ROOT}/me/messages/AAMk%2Fid%2B1%3D/$value`);
  });
});

describe("writing and sending a reply", () => {
  const reply = { to: ["tom.okafor@example.com"], subject: "We have received your request (reference 158949-003)", body: "Dear Tom Okafor,\n\nThank you.", inReplyTo: "<orig-1@example.com>", attachments: [] };

  test("is made as a reply to the original when the mailbox has it, then given our words and recipient", async () => {
    const { mailbox, calls, leaves } = standIn((c) => {
      if (c.method === "GET" && c.url.includes("internetMessageId")) return { json: { value: [{ id: "orig" }] } };
      if (c.method === "POST" && c.url.endsWith("/orig/createReply")) return { status: 201, json: { id: "draft-1" } };
      if (c.method === "PATCH" && c.url.endsWith("/draft-1")) return { json: { id: "draft-1", webLink: "https://outlook.office365.com/owa/?ItemID=draft-1" } };
      return undefined;
    });
    const draft = await mailbox.saveDraft(reply);
    expect(draft).toEqual({ id: "draft-1", webLink: "https://outlook.office365.com/owa/?ItemID=draft-1", threaded: true });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "PATCH"]);
    expect(calls[1].body).toBeUndefined();
    expect(calls[2].body).toEqual({
      subject: reply.subject,
      body: { contentType: "Text", content: reply.body },
      toRecipients: [{ emailAddress: { address: "tom.okafor@example.com" } }],
    });
    // Nothing here sends: saving a draft only writes to Drafts.
    expect(calls.some((c) => c.url.endsWith("/send"))).toBe(false);
    expect(new Set(leaves)).toEqual(new Set(["write"]));
  });

  test("is a new message when the original is not in this mailbox, or the case did not come from an email", async () => {
    const { mailbox, calls } = standIn((c) => {
      if (c.method === "GET") return { json: { value: [] } };
      if (c.method === "POST" && c.url === `${GRAPH_ROOT}/me/messages`) return { status: 201, json: { id: "draft-2", webLink: "https://evil.example/x" } };
      return undefined;
    });
    expect(await mailbox.saveDraft(reply)).toEqual({ id: "draft-2", webLink: null, threaded: false });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    await mailbox.saveDraft({ ...reply, inReplyTo: null });
    expect(calls.slice(2).map((c) => c.method)).toEqual(["POST"]);
  });

  test("attaches files, and removes the draft rather than leave it without one that failed", async () => {
    const ok = standIn((c) => {
      if (c.url === `${GRAPH_ROOT}/me/messages`) return { status: 201, json: { id: "d" } };
      if (c.url.endsWith("/d/attachments")) return { status: 201, json: {} };
      return undefined;
    });
    await ok.mailbox.saveDraft({ ...reply, inReplyTo: null, attachments: [{ name: "Guide.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF").buffer as ArrayBuffer }] });
    expect(ok.calls[1].body).toEqual({ "@odata.type": "#microsoft.graph.fileAttachment", name: "Guide.pdf", contentType: "application/pdf", contentBytes: "JVBERg==" });

    const bad = standIn((c) => {
      if (c.method === "POST" && c.url === `${GRAPH_ROOT}/me/messages`) return { status: 201, json: { id: "d" } };
      if (c.url.endsWith("/d/attachments")) return { status: 413, json: { error: { code: "ErrorMessageSizeExceeded" } } };
      if (c.method === "DELETE") return { status: 204 };
      return undefined;
    });
    await expect(bad.mailbox.saveDraft({ ...reply, inReplyTo: null, attachments: [{ name: "Big.pdf", type: "", bytes: new ArrayBuffer(4) }] })).rejects.toBeInstanceOf(MailboxError);
    expect(bad.calls.at(-1)).toMatchObject({ method: "DELETE", url: `${GRAPH_ROOT}/me/messages/d` });
  });

  test("sends only when send is called, and tells a draft from a sent email by isDraft, not by the sent time", async () => {
    let sent = false;
    const { mailbox, calls } = standIn((c) => {
      if (c.method === "POST" && c.url.endsWith("/draft-1/send")) return ((sent = true), { status: 202 });
      if (c.method === "GET" && c.url.includes("/draft-1/attachments")) return { json: { value: [{ name: "Guide.pdf" }] } };
      if (c.method === "GET" && c.url.includes("/draft-1?")) {
        return { json: { id: "draft-1", isDraft: !sent, sentDateTime: "2026-11-13T10:02:00Z", subject: "Re: Request", hasAttachments: true, toRecipients: [{ emailAddress: { address: "Tom.Okafor@example.com" } }] } };
      }
      return undefined;
    });
    // A draft carries a "sent" time too; it must still read as a draft.
    expect(await mailbox.status("draft-1")).toEqual({ state: "draft" });
    await mailbox.send("draft-1");
    expect(calls.at(-1)).toMatchObject({ method: "POST", url: `${GRAPH_ROOT}/me/messages/draft-1/send`, body: undefined });
    expect(await mailbox.status("draft-1")).toEqual({ state: "sent", sentAt: "2026-11-13T10:02:00Z", to: ["tom.okafor@example.com"], subject: "Re: Request", attachments: ["Guide.pdf"] });
    expect(await mailbox.status("deleted")).toEqual({ state: "gone" });
  });

  test("says what to do when Microsoft refuses", async () => {
    const failing = (status: number) => standIn(() => ({ status, json: { error: { code: "SomeCode" } } })).mailbox.listInbox({ since: "2026-11-13T00:00:00Z" });
    await expect(failing(401)).rejects.toMatchObject({ problem: "sign-in" });
    await expect(failing(403)).rejects.toMatchObject({ problem: "permission" });
    await expect(failing(429)).rejects.toMatchObject({ problem: "busy" });
    await expect(failing(500)).rejects.toMatchObject({ problem: "other" });
    await expect(failing(403)).rejects.toThrow(/organisation may need to approve/);
  });

  test("only ever offers a link to Outlook itself", () => {
    expect(safeWebLink("https://outlook.office365.com/owa/?ItemID=1")).toBe("https://outlook.office365.com/owa/?ItemID=1");
    expect(safeWebLink("https://outlook.live.com/mail/0/id/1")).not.toBeNull();
    expect(safeWebLink("http://outlook.office365.com/owa/")).toBeNull();
    expect(safeWebLink("https://office365.com.evil.example/owa/")).toBeNull();
    expect(safeWebLink("javascript:alert(1)")).toBeNull();
    expect(safeWebLink(null)).toBeNull();
  });
});

describe("addresses and message ids", () => {
  test("recipients are split, tidied and checked", () => {
    expect(splitRecipients("Tom.Okafor@example.com; <amy@example.org>, not-an-address tom.okafor@example.com")).toEqual(["tom.okafor@example.com", "amy@example.org"]);
    expect(splitRecipients("  ")).toEqual([]);
  });

  test("only a real Message-ID is used to join a conversation", () => {
    expect(asMessageId("<orig-1@example.com>")).toBe("<orig-1@example.com>");
    expect(asMessageId("orig-1@example.com")).toBe("<orig-1@example.com>");
    // A case whose email had no id is given a fingerprint, which no mailbox would recognise.
    expect(asMessageId("9f2c4e1ab07d")).toBeNull();
    expect(asMessageId(null)).toBeNull();
  });
});

describe("a reply that is saved or sent but not yet on the case", () => {
  const pending: PendingLetter = {
    state: "sent",
    draftId: "draft-1",
    webLink: null,
    mailbox: "alex.carter@consultancy.example",
    sample: false,
    savedAt: "2026-11-13T10:01:00Z",
    sentAt: "2026-11-13T10:02:00Z",
    to: ["tom.okafor@example.com"],
    subject: "We have received your request (reference 158949-003)",
    attachments: ["Guide.pdf"],
    summary: "Thank you for your request. We will respond by 16 November 2026.",
    letter: "Acknowledgement",
    action: "acknowledge",
    stepLabel: "Mark acknowledged",
  };

  test("survives being stored in the browser, and anything tampered with is cut down or dropped", () => {
    expect(parsePending(JSON.stringify(pending))).toEqual(pending);
    expect(parsePending("not json")).toBeNull();
    expect(parsePending(JSON.stringify({ subject: "no draft id" }))).toBeNull();
    const odd = parsePending(JSON.stringify({ ...pending, state: "whatever", to: ["a@example.com", 7], subject: "s".repeat(900), sample: "yes" }));
    expect(odd).toMatchObject({ state: "draft", to: ["a@example.com"], sample: false });
    expect(odd?.subject.length).toBe(300);
  });

  test("each step says what else it must be told", () => {
    expect(stepNeeds("acknowledge", false)).toEqual({ note: null, outcome: false, closes: false });
    expect(stepNeeds("pause", false).note).toBe("What you asked them to clarify");
    expect(stepNeeds("extend", false).note).toBe("Why the request is complex");
    expect(stepNeeds("close", true)).toEqual({ note: null, outcome: true, closes: true });
    expect(stepNeeds("close", false)).toEqual({ note: null, outcome: false, closes: true });
    expect(stepNeeds(null, true)).toEqual({ note: null, outcome: false, closes: false });
  });

  test("becomes the step, the London day and a short record that says it went from the app", () => {
    const r = sentRecord(pending, "tom.okafor@example.com", { note: "", outcome: "" });
    expect(r.action).toBe("acknowledge");
    expect(r.on).toBe("2026-11-13");
    expect(r.evidence).toBe(
      "Email evidence: sent 13 Nov 2026 at 10:02 to tom.okafor@example.com, the address on the case. Subject: “We have received your request (reference 158949-003)”. Attachment: Guide.pdf. Sent from Privacy Desk through alex.carter@consultancy.example. Summary: Thank you for your request. We will respond by 16 November 2026.",
    );
    expect(r.fallbackNote).toContain("Acknowledgement email sent 13 Nov 2026 at 10:02 to tom.okafor@example.com");
  });

  test("says so when it went somewhere other than the address on the case, or from the sample mailbox", () => {
    expect(sentRecord({ ...pending, to: ["someone@example.org"] }, "tom.okafor@example.com", { note: "", outcome: "" }).evidence).toContain("which is not the address on the case");
    expect(sentRecord({ ...pending, sample: true }, "tom.okafor@example.com", { note: " asked ", outcome: " Upheld " })).toMatchObject({ note: "asked", outcome: "Upheld" });
    expect(sentRecord({ ...pending, sample: true }, null, { note: "", outcome: "" }).evidence).toContain("a sample mailbox, so nothing was really sent");
  });

  test("the record without the app's line is unchanged for an email dropped in by hand", () => {
    const recipient = checkRecipient({ from: { name: "", email: "a@x.example" }, to: [{ name: "", email: "tom.okafor@example.com" }], cc: [] }, "tom.okafor@example.com");
    expect(evidenceLine({ sentAt: "2026-11-13T10:02:00Z", recipient, subject: "Hello", attachments: [], summary: null })).not.toContain("Sent from Privacy Desk");
  });
});

describe("the sample mailbox", () => {
  test("lists made-up emails for a period and hands each over in a form the importer reads", async () => {
    const box = sampleMailbox();
    expect(box.account.sample).toBe(true);
    const day = await box.listInbox({ since: new Date(Date.now() - 24 * 3_600_000).toISOString() });
    const month = await box.listInbox({ since: new Date(Date.now() - 30 * 24 * 3_600_000).toISOString() });
    expect(day.messages.length).toBeGreaterThan(0);
    expect(month.messages.length).toBeGreaterThan(day.messages.length);
    expect(month.messages.every((m) => m.fromEmail?.endsWith("@example.com") || m.fromEmail?.endsWith("@example.org"))).toBe(true);

    const first = day.messages[0];
    const parsed = await parseEmailFile("sample.eml", await box.mime(first.id));
    expect(parsed.problem).toBeNull();
    expect(parsed.subject).toBe(first.subject);
    expect(parsed.fromEmail).toBe(first.fromEmail);
    expect(parsed.body).toContain("Sample data.");
    expect(asMessageId(parsed.messageId)).not.toBeNull();
  });
});
