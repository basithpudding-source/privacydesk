import { describe, expect, it } from "vitest";
import { buildReport, nextStep, type ReportCase } from "./build";

const base: ReportCase = {
  ref: "EHT-001",
  type: "sar",
  status: "open",
  received_on: "2026-10-02",
  closed_on: null,
  outcome: null,
  clock_state: "extended",
  ack_due: null,
  response_due: "2027-01-08",
  days_left: 61,
};

describe("monthly report text", () => {
  it("reads like the prototype's report, with the numbers from the view", () => {
    const text = buildReport({
      organisationName: "Example Housing Trust",
      month: "2026-11",
      today: "2026-11-08",
      numbers: { received: 2, complaints: 2, sars: 0, complaints_acknowledged: 1, acknowledged_on_time: 1, closed: 1, closed_on_time: 1 },
      cases: [
        base,
        { ...base, ref: "EHT-002", type: "complaint", clock_state: "awaiting_ack", ack_due: "2026-12-08", response_due: null, received_on: "2026-11-08", days_left: 30 },
        { ...base, ref: "EHT-003", type: "complaint", status: "closed", clock_state: "closed", received_on: "2026-11-08", closed_on: "2026-11-08", outcome: "Not upheld", days_left: null },
        { ...base, ref: "EHT-004", clock_state: "running", response_due: "2026-10-20", days_left: -19, received_on: "2026-09-20" },
      ],
    });
    expect(text).toContain("Data protection cases: Example Housing Trust, November 2026");
    expect(text).toContain("Received: 2 (2 complaints).");
    expect(text).toContain("Complaints acknowledged: 1, 1 within the 30-day limit.");
    expect(text).toContain("Cases closed: 1, 1 within their time limits.");
    expect(text).toContain("Open now: 3.");
    expect(text).toContain("Overdue now: 1 (EHT-004).");
    expect(text).toContain("- EHT-001, Subject access request, received 2 Oct 2026: respond by 8 Jan 2027 (extended).");
    expect(text).toContain("- EHT-002, Complaint, received 8 Nov 2026: acknowledge by 8 Dec 2026.");
    expect(text).toContain("- EHT-003, Complaint: Not upheld (8 Nov 2026).");
    expect(text).toContain("Prepared Sunday 8 November 2026 from the Privacy Desk case register.");
  });

  it("says what comes next for stopped clocks", () => {
    expect(nextStep({ ...base, clock_state: "waiting_id" })).toBe("waiting for proof of identity (clock not started)");
    expect(nextStep({ ...base, clock_state: "paused" })).toBe("clock stopped pending clarification");
    expect(nextStep({ ...base, type: "complaint", clock_state: "acknowledged" })).toBe("acknowledged; respond without undue delay");
  });

  it("copes with a month the view has no row for", () => {
    const text = buildReport({ organisationName: "X", month: "2026-03", today: "2026-11-08", numbers: null, cases: [] });
    expect(text).toContain("Received: 0.");
    expect(text).toContain("Open now: 0.");
    expect(text).not.toContain("Cases closed");
  });
});
