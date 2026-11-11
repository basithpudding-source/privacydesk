import { describe, expect, it } from "vitest";
import { confirmationEmail, readableOn, responseDates } from "./copy";
import { linkBase } from "./base-url";
import { hashToken, looksLikeToken, makeToken } from "./tokens";

describe("one-time link tokens", () => {
  it("makes URL-safe tokens the link check accepts, and stores only a hex hash", () => {
    const t = makeToken();
    expect(looksLikeToken(t)).toBe(true);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toBe(hashToken(makeToken()));
  });

  it("refuses things that are not tokens before the database is asked", () => {
    expect(looksLikeToken(undefined)).toBe(false);
    expect(looksLikeToken("")).toBe(false);
    expect(looksLikeToken("abc")).toBe(false);
    expect(looksLikeToken("a".repeat(43) + "!")).toBe(false);
  });

  it("hashes the same token the same way every time (the database compares hashes)", () => {
    expect(hashToken("fixed")).toBe(hashToken("fixed"));
  });
});

describe("what the confirmation tells the requester", () => {
  it("a copy of their data: one calendar month, moved past a weekend and the Boxing Day holiday", () => {
    // Fri 27 Nov 2026 + 1 month = Sun 27 Dec; Mon 28 Dec is the Boxing Day substitute, so Tue 29 Dec.
    const r = responseDates("sar", "2026-11-27", "england-and-wales");
    expect(r.due).toBe("2026-12-29");
    expect(r.sentence).toContain("Tuesday 29 December 2026");
  });

  it("a month from the 31st lands on the last day of a shorter month (ICO example)", () => {
    expect(responseDates("sar", "2028-01-31", "england-and-wales").due).toBe("2028-02-29");
  });

  it("a complaint: acknowledged within 30 days, next working day if that is a weekend", () => {
    // Thu 5 Jun 2025 + 30 days = Sat 5 Jul, so Mon 7 Jul (ICO example for complaints).
    const r = responseDates("complaint", "2025-06-05", "england-and-wales");
    expect(r.due).toBe("2025-07-07");
    expect(r.sentence).toContain("acknowledge your complaint by Monday 7 July 2025");
  });

  it("the email carries the reference, the date, the response sentence and who to contact", () => {
    const m = confirmationEmail({
      ref: "EHT-W0001",
      kind: "sar",
      receivedOn: "2026-11-09",
      region: "scotland",
      organisationName: "Example Housing Trust",
      requesterName: "Sam Example",
      contactEmail: "dpo@example.org",
    });
    expect(m.subject).toBe("Your request to Example Housing Trust: reference EHT-W0001");
    expect(m.text).toContain("Your reference: EHT-W0001");
    expect(m.text).toContain("Received: Monday 9 November 2026");
    expect(m.text).toContain("respond by Wednesday 9 December 2026");
    expect(m.text).toContain("email dpo@example.org");
  });
});

describe("text on the client's colour", () => {
  it("puts white on a dark blue and black on a yellow", () => {
    expect(readableOn("#1d5c86")).toBe("#ffffff");
    expect(readableOn("#ffd500")).toBe("#000000");
  });
});

describe("the address emailed links point to", () => {
  const spoofed = { host: "evil.example", forwardedHost: "evil.example", forwardedProto: "https" };

  it("uses APP_URL and ignores the request's host", () => {
    expect(linkBase("https://desk.example.co.uk/", true, spoofed)).toBe("https://desk.example.co.uk");
    expect(linkBase("https://desk.example.co.uk", false, spoofed)).toBe("https://desk.example.co.uk");
  });

  it("refuses to build a link in production without APP_URL, whatever the request says", () => {
    expect(linkBase(undefined, true, spoofed)).toBeNull();
    expect(linkBase("", true, spoofed)).toBeNull();
    expect(linkBase("desk.example.co.uk", true, spoofed)).toBeNull();
  });

  it("falls back to the request's host in development only", () => {
    expect(linkBase(undefined, false, { host: "localhost:3000", forwardedHost: null, forwardedProto: null })).toBe("http://localhost:3000");
    expect(linkBase(undefined, false, { host: null, forwardedHost: null, forwardedProto: null })).toBe("http://localhost:3000");
  });
});
