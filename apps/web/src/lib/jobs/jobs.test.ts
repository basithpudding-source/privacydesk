import { describe, expect, it } from "vitest";
import { parseGovUkHolidays } from "./holidays";
import { buildDigests, delivered, logRowsFor, type ReminderRow } from "./reminders";

describe("GOV.UK bank holidays", () => {
  it("turns the feed into rows for all three regions and skips what it does not know", () => {
    const rows = parseGovUkHolidays({
      "england-and-wales": { division: "england-and-wales", events: [{ title: "New Year’s Day", date: "2027-01-01" }] },
      scotland: { division: "scotland", events: [{ title: "2nd January", date: "2027-01-04" }, { title: "bad", date: "soon" }] },
      "northern-ireland": { division: "northern-ireland", events: [{ title: "St Patrick’s Day", date: "2027-03-17" }] },
      mars: { division: "mars", events: [{ title: "Landing Day", date: "2027-02-02" }] },
    });
    expect(rows).toEqual([
      { region: "england-and-wales", day: "2027-01-01", name: "New Year's Day" },
      { region: "scotland", day: "2027-01-04", name: "2nd January" },
      { region: "northern-ireland", day: "2027-03-17", name: "St Patrick's Day" },
    ]);
  });
});

describe("reminder digests", () => {
  const row = (over: Partial<ReminderRow>): ReminderRow => ({
    case_id: "c1",
    ref: "EHT-001",
    type: "sar",
    clock_state: "running",
    due_on: "2026-11-15",
    bucket: 7,
    organisation_id: "o1",
    organisation_name: "Example Housing Trust",
    partner_id: "p1",
    partner_name: "Sample Partner B Ltd",
    user_id: "u1",
    email: "b@example.com",
    ...over,
  });

  it("writes one digest per person, today's deadlines first, with a link to each case", () => {
    const digests = buildDigests(
      [
        row({}),
        row({ case_id: "c2", ref: "EHT-002", type: "complaint", bucket: 0, due_on: "2026-11-08" }),
        row({ case_id: "c1", user_id: "u2", email: "c@example.com" }),
      ],
      "https://desk.example",
    );
    expect(digests).toHaveLength(2);
    const b = digests.find((d) => d.email === "b@example.com")!;
    expect(b.subject).toBe("Privacy Desk: 1 legal deadline due today");
    expect(b.text.indexOf("Due today")).toBeLessThan(b.text.indexOf("Due within 7 days"));
    expect(b.text).toContain("- EHT-002, complaint (acknowledgement due), Example Housing Trust: Sunday 8 November 2026. https://desk.example/cases/c2");
    expect(b.text).toContain("nothing has been sent to the requester");
    expect(b.caseIds).toEqual(["c1", "c2"]);
    expect(digests.find((d) => d.email === "c@example.com")!.subject).toBe("Privacy Desk: 1 legal deadline coming up");
  });

  it("puts overdue cases first and says so in the subject", () => {
    const [d] = buildDigests(
      [
        row({}),
        row({ case_id: "c2", ref: "EHT-002", bucket: 0, due_on: "2026-11-08" }),
        row({ case_id: "c3", ref: "EHT-003", bucket: -1, due_on: "2026-11-05" }),
      ],
      "https://desk.example",
    );
    expect(d.subject).toBe("Privacy Desk: 1 legal deadline overdue, 1 due today");
    expect(d.text).toContain("3 cases, 1 overdue, 1 due today.");
    expect(d.text.indexOf("Overdue")).toBeLessThan(d.text.indexOf("Due today"));
    expect(d.text).toContain("- EHT-003, subject access request, Example Housing Trust: Thursday 5 November 2026.");
  });

  it("counts a digest as delivered only when the email really went", () => {
    expect(delivered({ sent: true }, true)).toBe(true);
    expect(delivered({ sent: false, reason: "failed" }, true)).toBe(false);
    expect(delivered({ sent: false, reason: "failed" }, false)).toBe(false);
    // No sender configured: a failure in production, printed to the log in development.
    expect(delivered({ sent: false, reason: "not-configured" }, true)).toBe(false);
    expect(delivered({ sent: false, reason: "not-configured" }, false)).toBe(true);
  });

  it("logs one row per case, stage, due date and person, for delivered digests only", () => {
    const digests = buildDigests(
      [row({}), row({ case_id: "c2", ref: "EHT-002", bucket: 0, due_on: "2026-11-08" }), row({ user_id: "u2", email: "c@example.com" })],
      "https://desk.example",
    );
    const wentToB = digests.filter((d) => d.email === "b@example.com");
    expect(logRowsFor(wentToB)).toEqual([
      { case_id: "c1", bucket: 7, due_on: "2026-11-15", user_id: "u1", recipients: 1 },
      { case_id: "c2", bucket: 0, due_on: "2026-11-08", user_id: "u1", recipients: 1 },
    ]);
    expect(logRowsFor([])).toEqual([]);
  });

  it("does not write to an organisation's own team about clients", () => {
    const own = { partner_name: "Example Housing Trust", partner_kind: "organisation" };
    const [d] = buildDigests([row({ ...own }), row({ ...own, case_id: "c2", ref: "EHT-002", bucket: 0, due_on: "2026-11-08" })], "https://desk.example");
    expect(d.text).toContain("Legal deadlines for Example Housing Trust: 2 cases, 1 due today.");
    // Every case is the organisation's, so each line gives the reference and type only.
    expect(d.text).toContain("- EHT-002, subject access request: Sunday 8 November 2026. https://desk.example/cases/c2");
    expect(d.text).not.toMatch(/client/i);
    // A desk with no kind recorded (before migration 0022) reads as a consultancy, as before.
    const [c] = buildDigests([row({})], "https://desk.example");
    expect(c.text).toContain("Legal deadlines for Sample Partner B Ltd's clients: 1 case.");
  });

  it("sends nothing when nothing is due", () => {
    expect(buildDigests([], "https://desk.example")).toEqual([]);
  });
});
