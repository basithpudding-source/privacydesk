import { describe, expect, test } from "vitest";
import { composeEmailBody, emailLaunch, emailSubject, findFlags, highlightSegments, mailtoHref, mailtoLimit, MAILTO_LIMIT_WINDOWS, quotedOriginal } from "./email";

describe("the subject line of a reply", () => {
  const base = { typeLabel: "Subject access request", ref: "EHT-014", isComplaint: false };

  test("keeps the person's own subject, so the reply threads with their email", () => {
    expect(emailSubject({ ...base, kind: "ack", originalSubject: "Request for my personal data" })).toBe("Re: Request for my personal data (reference EHT-014)");
  });

  test("does not stack prefixes or repeat a reference that is already there", () => {
    expect(emailSubject({ ...base, kind: "ack", originalSubject: "RE: Fwd: re: My data" })).toBe("Re: My data (reference EHT-014)");
    expect(emailSubject({ ...base, kind: "ack", originalSubject: "Your request EHT-014" })).toBe("Re: Your request EHT-014");
  });

  test("says what the letter is when there was no subject", () => {
    expect(emailSubject({ ...base, kind: "ack", originalSubject: null })).toBe("We have received your subject access request (reference EHT-014)");
    expect(emailSubject({ ...base, kind: "id" })).toBe("Proof of identity needed for your subject access request (reference EHT-014)");
    expect(emailSubject({ ...base, kind: "extend", originalSubject: "  " })).toBe("More time needed for your subject access request (reference EHT-014)");
    expect(emailSubject({ kind: "outcome", typeLabel: "Complaint", ref: "EHT-015", isComplaint: true })).toBe("The outcome of your complaint (reference EHT-015)");
  });

  test("stays on one line and within a sensible length", () => {
    const s = emailSubject({ ...base, kind: "ack", originalSubject: `Hello\r\nBcc: someone@example.com ${"x".repeat(300)}` });
    expect(s).not.toMatch(/[\r\n]/);
    expect(s.length).toBeLessThan(160);
  });
});

describe("quoting the original message", () => {
  const original = { fromName: "Helen Marsh", fromEmail: "helen.marsh@example.com", sentOn: "2026-10-14", subject: "My address", body: "You shared my address.\r\n\r\nI want this looked into." };

  test("gives a header and the person's words, quoted", () => {
    expect(quotedOriginal(original)).toBe(
      ["-----Original message-----", "From: Helen Marsh <helen.marsh@example.com>", "Sent: Wednesday 14 October 2026", "Subject: My address", "", "> You shared my address.", ">", "> I want this looked into."].join("\n"),
    );
  });

  test("copes with a message that has no subject or sender details", () => {
    const q = quotedOriginal({ fromName: null, fromEmail: null, sentOn: "2026-10-14", subject: null, body: "Hello" });
    expect(q).toContain("From: Unknown sender");
    expect(q).not.toContain("Subject:");
  });

  test("puts the original under the reply, or leaves it out", () => {
    expect(composeEmailBody("Dear Helen,\n\nThank you.\n\n", original)).toMatch(/^Dear Helen,\n\nThank you\.\n\n\n-----Original message-----/);
    expect(composeEmailBody("Dear Helen,\r\n\r\nThank you.  \n", null)).toBe("Dear Helen,\n\nThank you.");
  });
});

describe("the link that opens the email program", () => {
  test("carries the recipient, subject and text, with proper line breaks", () => {
    const href = mailtoHref("helen.marsh@example.com", "Re: My address & more", "Line one\nLine two");
    expect(href).toBe("mailto:helen.marsh@example.com?subject=Re:%20My%20address%20%26%20more&body=Line%20one%0D%0ALine%20two");
  });

  test("leaves out an address that is not an email address, and cannot be used to add headers", () => {
    expect(mailtoHref("not an address", "Hi", "")).toBe("mailto:?subject=Hi");
    // An "address" carrying extra link parameters is not an address: it is dropped whole.
    expect(mailtoHref("a@example.com?cc=x@example.com", "Hi", "")).toBe("mailto:?subject=Hi");
    expect(mailtoHref("a+b@example.com", "Hi", "")).toBe("mailto:a%2Bb@example.com?subject=Hi");
    expect(mailtoHref("a@example.com", "Hi\r\nBcc: x@example.com", "")).toBe("mailto:a@example.com?subject=Hi%20Bcc:%20x%40example.com");
    // The marks that would start a new part of the link stay encoded.
    expect(mailtoHref("a@example.com", "A&B=C#D?E", "50% + more")).toBe("mailto:a@example.com?subject=A%26B%3DC%23D%3FE&body=50%25%20%2B%20more");
  });

  const original = { fromName: "Helen Marsh", fromEmail: "helen.marsh@example.com", sentOn: "2026-10-14", subject: "My address", body: "You shared my address. ".repeat(120) };
  const limit = MAILTO_LIMIT_WINDOWS;

  test("carries the whole email when it fits", () => {
    const launch = emailLaunch({ to: "a@example.com", subject: "Hi", reply: "A short note.", original: { ...original, body: "Hello" }, limit });
    expect(launch.carried).toBe("all");
    expect(launch.clipboard).toBeNull();
    expect(decodeURIComponent(launch.href)).toContain("-----Original message-----");
  });

  test("carries the reply and hands the original over by clipboard when both do not fit", () => {
    const launch = emailLaunch({ to: "a@example.com", subject: "Hi", reply: "Dear Helen,\n\nThank you for writing.", original, limit });
    expect(launch.carried).toBe("reply");
    expect(launch.href.length).toBeLessThanOrEqual(limit);
    expect(decodeURIComponent(launch.href)).toContain("Thank you for writing.");
    expect(decodeURIComponent(launch.href)).not.toContain("Original message");
    expect(launch.clipboard).toBe(quotedOriginal(original));
  });

  test("carries only the recipient and subject when even the reply is too long, with everything on the clipboard", () => {
    const reply = "word ".repeat(600);
    const launch = emailLaunch({ to: "a@example.com", subject: "Hi", reply, original, limit });
    expect(launch.carried).toBe("none");
    expect(launch.href).toBe("mailto:a@example.com?subject=Hi");
    expect(launch.clipboard).toBe(composeEmailBody(reply, original));
  });

  test("allows longer links away from Windows", () => {
    expect(mailtoLimit("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(2000);
    expect(mailtoLimit("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(7000);
    const reply = "word ".repeat(600);
    expect(emailLaunch({ to: "a@example.com", subject: "Hi", reply, original: null, limit: mailtoLimit("Macintosh") }).carried).toBe("all");
  });
});

describe("what to complete or check before sending", () => {
  const facts = {
    knownDates: [
      { date: "2026-10-14", label: "received" },
      { date: "2026-11-13", label: "legal deadline" },
    ],
    refs: ["158941-001"],
    requesterName: "Helen Marsh",
  };

  test("finds every gap left in square brackets", () => {
    const { flags } = findFlags("We will write by [date for full response]. Contact [staff member name] at [email address].", facts);
    expect(flags.map((f) => [f.level, f.text])).toEqual([
      ["fill", "[date for full response]"],
      ["fill", "[staff member name]"],
      ["fill", "[email address]"],
    ]);
  });

  test("accepts dates that are dates of the case, and says which", () => {
    const { flags, matched } = findFlags("We received it on Wednesday 14 October 2026 and will acknowledge by 13 November 2026.", facts);
    expect(flags).toEqual([]);
    expect(matched).toEqual([
      { text: "Wednesday 14 October 2026", label: "received" },
      { text: "13 November 2026", label: "legal deadline" },
    ]);
  });

  test("flags a date that is not one of the case's dates", () => {
    const { flags } = findFlags("We will respond by 20 November 2026.", facts);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ level: "check", text: "20 November 2026" });
    expect(flags[0].message).toContain("not one of this case's dates");
  });

  test("flags a weekday that does not belong to its date, and a date that does not exist", () => {
    const wrongDay = findFlags("received on Thursday 14 October 2026", facts).flags[0];
    expect(wrongDay.message).toContain("that date is a Wednesday");
    expect(findFlags("by 31 November 2026", facts).flags[0].message).toContain("not a real date");
  });

  test("reads ordinals and numeric dates the British way round", () => {
    expect(findFlags("on 14th October 2026 and again 13/11/2026", facts).flags).toEqual([]);
    expect(findFlags("on 11/13/2026", facts).flags[0].message).toContain("not a real date");
  });

  test("flags a reference that is nearly this case's but not quite", () => {
    const { flags } = findFlags("Your reference is 158941-007. Quote 158941-001 when you write.", facts);
    expect(flags.map((f) => f.text)).toEqual(["158941-007"]);
    expect(flags[0].message).toContain("158941-001");
  });

  test("flags a title in the greeting that the case never gave", () => {
    const guess = findFlags("Dear Ms Marsh,\n\nThank you.", facts).flags;
    expect(guess).toHaveLength(1);
    expect(guess[0]).toMatchObject({ level: "check", text: "Ms", start: 5, end: 7 });
    expect(findFlags("Dear Helen Marsh,", facts).flags).toEqual([]);
    expect(findFlags("Dear Dr Marsh,", { ...facts, requesterName: "Dr Helen Marsh" }).flags).toEqual([]);
  });

  test("a date inside a gap is one flag, not two", () => {
    expect(findFlags("by [14 October 2027 or later]", facts).flags).toHaveLength(1);
  });

  test("flags come back in reading order and cut the text cleanly for highlighting", () => {
    const text = "Dear Ms Marsh, we will reply by 20 November 2026. [Name]";
    const { flags } = findFlags(text, facts);
    expect(flags.map((f) => f.text)).toEqual(["Ms", "20 November 2026", "[Name]"]);
    const segments = highlightSegments(text, flags);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    expect(segments.filter((s) => s.flag !== null).map((s) => s.text)).toEqual(["Ms", "20 November 2026", "[Name]"]);
  });
});
