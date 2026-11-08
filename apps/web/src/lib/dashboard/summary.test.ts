import { describe, expect, it } from "vitest";
import type { DeadlineRow } from "@/lib/cases/types";
import { summarise } from "./summary";

const org = { id: "o1", name: "Example Housing Trust", colour: "#1d5c86" };
const other = { id: "o2", name: "Other Client", colour: "#884400" };

function row(over: Partial<DeadlineRow>): DeadlineRow {
  return {
    case_id: over.ref ?? "x",
    ref: "EHT-001",
    organisation_id: "o1",
    type: "sar",
    status: "open",
    received_on: "2026-10-02",
    clock_state: "running",
    ack_due: null,
    response_due: "2026-11-05",
    internal_target: null,
    days_left: 10,
    met_on_time: null,
    ...over,
  };
}

describe("dashboard summary", () => {
  const rows: DeadlineRow[] = [
    row({ ref: "EHT-001", days_left: 10 }),
    row({ ref: "EHT-002", type: "complaint", clock_state: "awaiting_ack", ack_due: "2026-11-10", response_due: null, days_left: 2, received_on: "2026-11-01" }),
    row({ ref: "EHT-003", days_left: -3, response_due: "2026-11-05" }),
    row({ ref: "EHT-004", status: "closed", clock_state: "closed", days_left: null, met_on_time: true, received_on: "2026-09-15" }),
    row({ ref: "EHT-005", status: "closed", clock_state: "closed", days_left: null, met_on_time: false, received_on: "2026-06-30" }),
    row({ ref: "OTH-001", organisation_id: "o2", days_left: 0, response_due: "2026-11-08", received_on: "2026-10-08" }),
  ];
  const s = summarise(rows, [org, other], "2026-11-08");

  it("counts the tiles", () => {
    expect(s.open).toBe(4);
    expect(s.dueWeek).toBe(2); // 2 days and today; the overdue one is not "due", it is late
    expect(s.overdue).toBe(1);
    expect(s.measured).toBe(2);
    expect(s.met).toBe(1);
  });

  it("lists what needs attention soonest first, overdue included", () => {
    expect(s.attention.map((a) => a.ref)).toEqual(["EHT-003", "OTH-001", "EHT-002"]);
    expect(s.attention[0].organisation.name).toBe("Example Housing Trust");
  });

  it("counts six months by type, oldest first", () => {
    expect(s.months.map((m) => m.label)).toEqual(["Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26", "Nov 26"]);
    expect(s.months[4]).toMatchObject({ complaint: 0, sar: 3, other: 0 }); // Oct: EHT-001, EHT-003, OTH-001
    expect(s.months[5]).toMatchObject({ complaint: 1, sar: 0 });
    expect(s.months[0]).toMatchObject({ sar: 1 }); // 30 June, the oldest month shown
  });

  it("gives each client its own row", () => {
    const eht = s.clients.find((c) => c.id === "o1");
    expect(eht).toMatchObject({ open: 3, dueWeek: 1, overdue: 1, receivedThisMonth: 1, measured: 2, met: 1 });
    expect(s.clients.find((c) => c.id === "o2")).toMatchObject({ open: 1, dueWeek: 1, overdue: 0 });
  });
});
