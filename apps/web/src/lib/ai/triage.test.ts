import { describe, expect, test } from "vitest";
import { keywordTriage } from "./keywords";
import { cleanTriage } from "./triage-types";

describe("keyword triage (the fallback)", () => {
  test("spots a subject access request in plain words", () => {
    const r = keywordTriage("Hi, can you send me a copy of my file and everything you have on me? Thanks, Sam (sam@example.com)");
    expect(r.by).toBe("keywords");
    expect(r.type).toBe("sar");
    expect(r.requesterEmail).toBe("sam@example.com");
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(0.85);
  });

  test("spots a complaint and lists other matches", () => {
    const r = keywordTriage("You shared my details with my landlord without my consent. I want to complain, and delete my data too.");
    expect(r.type).toBe("complaint");
    expect(r.also).toContain("erasure");
  });

  test("says when nothing matches", () => {
    const r = keywordTriage("Your car insurance renewal is due. Call us today.");
    expect(r.type).toBe("not_dp");
    expect(r.confidence).toBeLessThan(0.5);
  });

  // Found on 12 November 2026: this message was shown as "not about personal data".
  test("spots a request to correct details that does not say 'correct my'", () => {
    const r = keywordTriage("You have my old address on file. Please correct it to my new one and confirm when done. I would also like to know what else you hold about me.");
    expect(r.type).toBe("rectification");
    expect(r.also).toContain("sar");
    expect(r.reasons).toContain("“correct it”");
  });

  test.each([
    ["sar", "What do you hold about me? Please send all my data."],
    ["sar", "I am making a DSAR."],
    ["erasure", "Please delete everything and close my account."],
    ["rectification", "The date of birth you have is inaccurate."],
    ["objection", "Please stop emailing me, I opted out last year."],
    ["complaint", "You gave out my number without my permission."],
  ])("spots %s wording written loosely", (type, text) => {
    expect(keywordTriage(text).type).toBe(type);
  });

  test.each([
    "Your car insurance renewal is due. Call us today.",
    "Can you confirm the opening hours over Christmas?",
    "Invoice 2041 is attached. Payment is due in 30 days.",
    "Thanks for the update, see you on Tuesday.",
  ])("does not see a request in ordinary mail: %s", (text) => {
    expect(keywordTriage(text).type).toBe("not_dp");
  });
});

describe("cleaning a model answer", () => {
  test("clamps, trims and drops the chosen type from 'also'", () => {
    const r = cleanTriage(
      {
        type: "sar",
        also: ["sar", "complaint", "nonsense" as never],
        confidence: 1.7,
        summary: "x".repeat(400),
        requesterEmail: "PAT@Example.com",
        reasons: ["a", "b", "c", "d", "e", "f"],
      },
      "ai",
      "claude-opus-5-5",
    );
    expect(r.also).toEqual(["complaint"]);
    expect(r.confidence).toBe(1);
    expect(r.summary).toHaveLength(300);
    expect(r.requesterEmail).toBe("pat@example.com");
    expect(r.reasons).toHaveLength(5);
    expect(r.model).toBe("claude-opus-5-5");
  });

  test("an unknown type becomes not_dp", () => {
    expect(cleanTriage({ type: "weird" as never }, "ai").type).toBe("not_dp");
  });
});
