import { describe, expect, test } from "vitest";
import { MAX_BODY, parseEmailFile } from "./parse-email";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

const EML = [
  "From: Lena Ortiz <Lena.Ortiz@example.com>",
  "To: privacy@client.example",
  "Subject: Please correct my address",
  "Date: Tue, 20 Oct 2026 09:30:00 +0100",
  "Message-ID: <abc-123@example.com>",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Sample data.",
  "",
  "You have my old address on file. Please correct it.",
  "",
].join("\r\n");

describe("reading a saved email", () => {
  test("takes the sender, subject, text, date and id from an .eml file", async () => {
    const e = await parseEmailFile("request.eml", bytes(EML));
    expect(e.problem).toBeNull();
    expect(e.fromName).toBe("Lena Ortiz");
    expect(e.fromEmail).toBe("lena.ortiz@example.com");
    expect(e.subject).toBe("Please correct my address");
    expect(e.body).toBe("Sample data.\n\nYou have my old address on file. Please correct it.");
    // 09:30 British Summer Time is 08:30 UTC: the day it arrived is kept exactly.
    expect(e.receivedAt).toBe("2026-10-20T08:30:00.000Z");
    expect(e.messageId).toBe("<abc-123@example.com>");
  });

  test("falls back to the HTML part when there is no plain text", async () => {
    const html = EML.replace("text/plain", "text/html").replace(/Sample data\.[\s\S]*$/, "<p>Please <b>delete</b> my account &amp; data.</p><p>Thanks</p>\r\n");
    const e = await parseEmailFile("html.eml", bytes(html));
    expect(e.body).toContain("delete");
    expect(e.body).toContain("my account & data.");
    expect(e.body).not.toContain("<");
  });

  test("gives the same id to the same email without a Message-ID, and a different id to a different one", async () => {
    const bare = EML.replace("Message-ID: <abc-123@example.com>\r\n", "");
    const a = await parseEmailFile("a.eml", bytes(bare));
    const again = await parseEmailFile("renamed copy.eml", bytes(bare));
    const other = await parseEmailFile("b.eml", bytes(bare.replace("correct it", "delete it")));
    expect(a.messageId).toMatch(/^import:[0-9a-f]{64}$/);
    expect(again.messageId).toBe(a.messageId);
    expect(other.messageId).not.toBe(a.messageId);
  });

  test("cuts very long text to what the inbox keeps and says so", async () => {
    const e = await parseEmailFile("long.eml", bytes(EML + "word ".repeat(15000)));
    expect(e.cut).toBe(true);
    expect(e.body.length).toBe(MAX_BODY);
  });

  test("says when a file is not an email", async () => {
    const e = await parseEmailFile("holiday.jpg", bytes("ÿØÿà"));
    expect(e.problem).not.toBeNull();
    const notes = await parseEmailFile("notes.txt", bytes("Some notes that are long enough to pass as a message body."));
    expect(notes.problem).toBe("This file does not look like an email.");
  });

  test("does not accept a sender that is not an email address", async () => {
    const e = await parseEmailFile("odd.eml", bytes(EML.replace("Lena Ortiz <Lena.Ortiz@example.com>", "Lena Ortiz")));
    expect(e.fromEmail).toBe("");
  });
});
