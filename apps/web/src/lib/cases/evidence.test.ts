import { describe, expect, test } from "vitest";
import { parseSentEmail, stripQuoted } from "@/lib/inbox/parse-email";
import { checkRecipient, checkSentDate, evidenceLine, plainSummary, sentWhen } from "./evidence";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

// A reply as it sits in a Sent folder: to the person, copied to a colleague, with a PDF
// attached, a logo inside the signature, and the person's own message quoted underneath.
const SENT = [
  "From: Alex Carter <alex.carter@consultancy.example>",
  "To: Tom Okafor <Tom.Okafor@example.com>",
  "Cc: Records Team <records@client.example>",
  "Subject: We have received your subject access request (reference 158949-003)",
  "Date: Thu, 12 Nov 2026 14:32:10 +0000",
  "Message-ID: <sent-1@consultancy.example>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="outer"',
  "",
  "--outer",
  'Content-Type: multipart/related; boundary="rel"',
  "",
  "--rel",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Dear Tom Okafor,",
  "",
  "Thank you for your subject access request, which we received on Thursday 15 October 2026. We are searching for the information now and will respond by Monday 16 November 2026.",
  "",
  "Please quote reference 158949-003 if you contact us.",
  "",
  "Yours sincerely,",
  "",
  "Alex Carter",
  "Data Protection Officer",
  "",
  "-----Original message-----",
  "From: Tom Okafor <tom.okafor@example.com>",
  "Sent: Thursday 15 October 2026",
  "",
  "> I would like my HR file and any recordings of calls with me.",
  "",
  "--rel",
  "Content-Type: image/png",
  "Content-ID: <logo@consultancy.example>",
  'Content-Disposition: inline; filename="logo.png"',
  "Content-Transfer-Encoding: base64",
  "",
  "iVBORw0KGgo=",
  "--rel--",
  "--outer",
  'Content-Type: application/pdf; name="How we handle requests.pdf"',
  'Content-Disposition: attachment; filename="How we handle requests.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0xLjQK",
  "--outer--",
  "",
].join("\r\n");

describe("reading a sent email", () => {
  test("finds who it went to, when, and what was attached, and keeps only the new text", async () => {
    const e = await parseSentEmail("sent.eml", bytes(SENT));
    expect(e.problem).toBeNull();
    expect(e.from).toEqual({ name: "Alex Carter", email: "alex.carter@consultancy.example" });
    expect(e.to).toEqual([{ name: "Tom Okafor", email: "tom.okafor@example.com" }]);
    expect(e.cc).toEqual([{ name: "Records Team", email: "records@client.example" }]);
    expect(e.sentAt).toBe("2026-11-12T14:32:10.000Z");
    expect(e.subject).toContain("reference 158949-003");
    expect(e.attachments).toContain("How we handle requests.pdf");
    expect(e.replyText).toContain("We are searching for the information now");
    expect(e.replyText).not.toContain("Original message");
    expect(e.replyText).not.toContain("recordings of calls");
  });

  test("says when a file is not an email", async () => {
    expect((await parseSentEmail("notes.txt", bytes("Just some notes."))).problem).not.toBeNull();
  });

  test("cuts quoted text in the common styles", () => {
    expect(stripQuoted("My reply.\n\nOn Thu, 15 Oct 2026 at 09:00, Tom <tom@example.com> wrote:\n> hello")).toBe("My reply.");
    expect(stripQuoted("My reply.\n\n________________________________\nFrom: Tom\nSent: 15 October 2026\nhello")).toBe("My reply.");
    expect(stripQuoted("My reply.\n\nFrom: Tom Okafor\nSent: 15 October 2026 09:00\nTo: Alex\nSubject: Request\n\nhello")).toBe("My reply.");
    expect(stripQuoted("Nothing quoted here.")).toBe("Nothing quoted here.");
  });
});

describe("was it sent to the person on the case?", () => {
  const sender = { name: "Alex Carter", email: "alex.carter@consultancy.example" };
  const tom = { name: "Tom Okafor", email: "tom.okafor@example.com" };
  const other = { name: "Someone Else", email: "someone@example.org" };

  test("yes, when the case's address is in To", () => {
    const c = checkRecipient({ from: sender, to: [tom], cc: [] }, "Tom.Okafor@example.com ");
    expect(c.verdict).toBe("ok");
    expect(c.words).toBe("to tom.okafor@example.com, the address on the case");
  });

  test("a warning when they were only copied in", () => {
    const c = checkRecipient({ from: sender, to: [other], cc: [tom] }, "tom.okafor@example.com");
    expect(c.verdict).toBe("warn");
    expect(c.words).toContain("was copied in");
  });

  test("a clear no when it went somewhere else", () => {
    const c = checkRecipient({ from: sender, to: [other], cc: [] }, "tom.okafor@example.com");
    expect(c.verdict).toBe("danger");
    expect(c.message).toContain("Not sent to the address on the case");
    expect(c.words).toBe("to someone@example.org, which is not the address on the case (tom.okafor@example.com)");
  });

  test("spots the person's own email dropped by mistake", () => {
    const c = checkRecipient({ from: tom, to: [sender], cc: [] }, "tom.okafor@example.com");
    expect(c.verdict).toBe("danger");
    expect(c.message).toContain("not the one you sent to them");
    // It is not evidence of anything sent, so it is refused rather than warned about.
    expect(c.unusable).toBe(true);
    expect(checkRecipient({ from: sender, to: [other], cc: [] }, "tom.okafor@example.com").unusable).toBeUndefined();
  });

  test("says so when the case has no address, or the file gives only names", () => {
    expect(checkRecipient({ from: sender, to: [tom], cc: [] }, null).verdict).toBe("info");
    const namesOnly = checkRecipient({ from: sender, to: [{ name: "Tom Okafor", email: "" }], cc: [] }, "tom.okafor@example.com");
    expect(namesOnly.verdict).toBe("warn");
    expect(namesOnly.words).toBe("to Tom Okafor (addresses could not be read from the file)");
  });
});

describe("when it was sent", () => {
  test("is given in London time, on the London day", () => {
    expect(sentWhen("2026-11-12T14:32:10.000Z")).toEqual({ date: "2026-11-12", words: "12 Nov 2026 at 14:32" });
    // 23:30 UTC in July is 00:30 the next day in London.
    expect(sentWhen("2026-07-01T23:30:00.000Z")).toEqual({ date: "2026-07-02", words: "2 Jul 2026 at 00:30" });
  });

  test("cannot stand as the step's date when missing, in the future, or before the case", () => {
    expect(checkSentDate("2026-11-12T14:32:10.000Z", "2026-10-15", "2026-11-12")).toBeNull();
    expect(checkSentDate(null, "2026-10-15", "2026-11-12")?.verdict).toBe("warn");
    expect(checkSentDate("2026-11-13T09:00:00.000Z", "2026-10-15", "2026-11-12")?.message).toContain("in the future");
    expect(checkSentDate("2026-10-01T09:00:00.000Z", "2026-10-15", "2026-11-12")?.message).toContain("before the case was received");
  });
});

describe("the summary without AI", () => {
  test("is the first sentence or two, without greeting or sign-off", () => {
    const s = plainSummary("Dear Tom Okafor,\n\nThank you for your request, which we received on 15 October 2026. We will respond by 16 November 2026.\n\nPlease quote the reference.\n\nYours sincerely,\n\nAlex Carter\nData Protection Officer");
    expect(s).toBe("Thank you for your request, which we received on 15 October 2026. We will respond by 16 November 2026.");
  });

  test("is short, and empty when there is nothing to say", () => {
    expect(plainSummary("word ".repeat(200)).length).toBeLessThanOrEqual(240);
    expect(plainSummary("Dear Tom,\n\nKind regards,\nAlex")).toBe("");
  });
});

describe("the evidence line kept on the audit trail", () => {
  const recipient = checkRecipient({ from: { name: "", email: "a@x.example" }, to: [{ name: "Tom", email: "tom.okafor@example.com" }], cc: [] }, "tom.okafor@example.com");

  test("gives the date, the recipient, the subject, the attachments and the summary", () => {
    expect(
      evidenceLine({ sentAt: "2026-11-12T14:32:10.000Z", recipient, subject: "We have received your request (reference 158949-003)", attachments: ["How we handle requests.pdf"], summary: "Acknowledged the request and gave the response date." }),
    ).toBe(
      "Email evidence: sent 12 Nov 2026 at 14:32 to tom.okafor@example.com, the address on the case. Subject: “We have received your request (reference 158949-003)”. Attachment: How we handle requests.pdf. Summary: Acknowledged the request and gave the response date.",
    );
  });

  test("says when there were no attachments, and leaves the summary out when there is none", () => {
    const line = evidenceLine({ sentAt: "2026-11-12T14:32:10.000Z", recipient, subject: "Hello", attachments: [], summary: null });
    expect(line).toBe("Email evidence: sent 12 Nov 2026 at 14:32 to tom.okafor@example.com, the address on the case. Subject: “Hello”. No attachments.");
  });

  test("is a record, not a copy: long values are cut and it stays inside the database's limit", () => {
    const line = evidenceLine({
      sentAt: "2026-11-12T14:32:10.000Z",
      recipient,
      subject: "s".repeat(500),
      attachments: Array.from({ length: 20 }, (_, i) => `file-${i}-${"n".repeat(200)}.pdf`),
      summary: "x".repeat(5000),
    });
    expect(line.length).toBeLessThanOrEqual(1400);
    expect(line).toContain("and 12 more");
  });
});
