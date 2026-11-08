// Tests the deadline engine against the ICO's own worked examples.
// Ported one-for-one from packages/clocks/clocks.test.js; keep the two in step.
import { describe, expect, test } from "vitest";
import * as c from "./clocks";

const none: c.Holidays = new Set();
const ew: c.Holidays = new Set(c.BANK_HOLIDAYS_ENGLAND_WALES);
const xmas2024: c.Holidays = new Set(["2024-12-25", "2024-12-26"]);

describe("complaints", () => {
  // Received Thursday 5 June, day 30 is Saturday 5 July, so Monday 7 July.
  test("ack rolls past weekend (ICO example)", () => {
    const r = c.complaintClock({ receivedOn: "2025-06-05" }, none);
    expect(r.ackDue).toBe("2025-07-07");
  });
  test("ack on a weekday stays put", () => {
    const r = c.complaintClock({ receivedOn: "2026-11-02" }, ew); // +30 = Wed 2 Dec 2026
    expect(r.ackDue).toBe("2026-12-02");
  });
  test("ack rolls past Christmas bank holidays", () => {
    const r = c.complaintClock({ receivedOn: "2026-11-25" }, ew); // +30 = Fri 25 Dec -> Mon 28 Dec (holiday) -> Tue 29 Dec
    expect(r.ackDue).toBe("2026-12-29");
  });
});

describe("SARs", () => {
  test("received on a bank holiday: 1 Jan to 1 Feb (ICO example)", () => {
    const r = c.sarClock({ receivedOn: "2027-01-01" }, ew);
    expect(r.due).toBe("2027-02-01");
  });
  test("31 Jan to last day of Feb, leap year (ICO example)", () => {
    const r = c.sarClock({ receivedOn: "2028-01-31" }, none);
    expect(r.due).toBe("2028-02-29");
  });
  test("31 Jan to 28 Feb in a normal year, then weekend roll", () => {
    const r = c.sarClock({ receivedOn: "2026-01-31" }, ew); // 28 Feb 2026 is a Saturday
    expect(r.due).toBe("2026-03-02");
  });
  test("Monday 25 Nov to Friday 27 Dec over Christmas (ICO example)", () => {
    const r = c.sarClock({ receivedOn: "2024-11-25" }, xmas2024);
    expect(r.due).toBe("2024-12-27");
  });
  test("extension: 7 Aug to 7 Nov (ICO example)", () => {
    const r = c.sarClock({ receivedOn: "2025-08-07", extended: true }, none);
    expect(r.due).toBe("2025-11-07");
    expect(r.state).toBe("extended");
  });
  test("stop the clock: 14 May, paused 15-18 May, due 18 June (ICO example)", () => {
    const r = c.sarClock({ receivedOn: "2025-05-14", pauses: [{ from: "2025-05-15", to: "2025-05-18" }] }, none);
    expect(r.pausedDays).toBe(4);
    expect(r.due).toBe("2025-06-18");
  });
  test("same-day clarification stops the clock for one day", () => {
    const r = c.sarClock({ receivedOn: "2025-05-14", pauses: [{ from: "2025-05-15", to: "2025-05-15" }] }, none);
    expect(r.pausedDays).toBe(1);
    expect(r.due).toBe("2025-06-16"); // 14 Jun + 1 = Sun 15 Jun -> Mon 16 Jun
  });
  test("waiting for ID has no deadline yet", () => {
    const r = c.sarClock({ receivedOn: "2026-11-02", idRequired: true }, ew);
    expect(r.state).toBe("waiting_id");
    expect(r.due).toBeNull();
  });
  test("clock starts on the day ID arrives", () => {
    const r = c.sarClock({ receivedOn: "2026-11-02", idRequired: true, idReceivedOn: "2026-11-05" }, ew);
    expect(r.due).toBe("2026-12-07"); // 5 Dec 2026 is a Saturday -> Mon 7 Dec
  });
  test("an open pause shows the clock as stopped", () => {
    const r = c.sarClock({ receivedOn: "2026-11-02", pauses: [{ from: "2026-11-04" }] }, ew);
    expect(r.state).toBe("paused");
    expect(r.due).toBeNull();
  });
});

describe("helpers", () => {
  test("end-of-month clamp keeps leap and non-leap years apart", () => {
    expect(c.addMonthsClamped("2026-10-31", 1)).toBe("2026-11-30");
    expect(c.addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
    expect(c.addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
  });
  test("date formats match CLAUDE.md", () => {
    expect(c.longDate("2026-11-23")).toBe("Monday 23 November 2026");
    expect(c.shortDate("2026-11-23")).toBe("23 Nov 2026");
  });
});

describe("caseClock routing", () => {
  test("other rights requests run on the one-month rule and keep their kind", () => {
    const r = c.caseClock({ type: "erasure", receivedOn: "2026-11-02" }, ew);
    expect(r.kind).toBe("erasure");
    expect(r.due).toBe("2026-12-02");
  });
  test("complaints route to the 30-day rule", () => {
    const r = c.caseClock({ type: "complaint", receivedOn: "2026-11-02" }, ew);
    expect(r.kind).toBe("complaint");
    expect(r.due).toBe("2026-12-02");
  });
});
