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
