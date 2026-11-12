import { describe, expect, test } from "vitest";
import type { DeadlineRow } from "@/lib/cases/types";
import { bucketOf, liveBoard } from "./live";

const a = { id: "o1", name: "Example Housing Trust", colour: "#1d5c86" };
const b = { id: "o2", name: "Other Client", colour: "#884400" };
// Thursday 12 November 2026.
const TODAY = "2026-11-12";

function row(over: Partial<DeadlineRow>): DeadlineRow {
  return {
    case_id: over.ref ?? "x",
    ref: "EHT-001",
    organisation_id: "o1",
    type: "sar",
    status: "open",
    received_on: "2026-10-12",
    clock_state: "running",
    ack_due: null,
    response_due: "2026-11-12",
    internal_target: null,
    days_left: 0,
    met_on_time: null,
    ...over,
  };
}

const rows = [
  row({ ref: "EHT-001", days_left: -7, response_due: "2026-11-05" }),
  row({ ref: "EHT-002", days_left: 0, response_due: "2026-11-12" }),
  row({ ref: "EHT-003", days_left: 4, response_due: "2026-11-16" }),
  row({ ref: "EHT-004", days_left: 6, response_due: "2026-11-18", organisation_id: "o2", type: "erasure" }),
  row({ ref: "EHT-005", clock_state: "waiting_id", days_left: null, response_due: null }),
  row({ ref: "EHT-006", clock_state: "paused", days_left: null, response_due: null, organisation_id: "o2" }),
  row({ ref: "EHT-007", type: "complaint", clock_state: "awaiting_ack", ack_due: "2026-11-13", response_due: null, days_left: 1 }),
  row({ ref: "EHT-008", days_left: 60, response_due: "2027-01-11" }),
  row({ ref: "EHT-009", status: "closed", clock_state: "closed", days_left: null, met_on_time: true }),
  row({ ref: "EHT-010", status: "closed", clock_state: "closed", days_left: null, met_on_time: false, organisation_id: "o2" }),
];

describe("the live dashboard", () => {
  test("puts each open case in one bucket, with the 5-day line the case list uses", () => {
    expect(bucketOf(row({ days_left: -1 }))).toBe("overdue");
    expect(bucketOf(row({ days_left: 0 }))).toBe("today");
    expect(bucketOf(row({ days_left: 5 }))).toBe("soon");
    expect(bucketOf(row({ days_left: 6 }))).toBe("onTrack");
    expect(bucketOf(row({ clock_state: "paused", days_left: -3 }))).toBe("notRunning");
    expect(bucketOf(row({ clock_state: "acknowledged", days_left: null }))).toBe("acknowledged");
  });

  const board = liveBoard(rows, [a, b], new Map([["o1", 3]]), TODAY);

  test("counts the queue, and the buckets add up to the open total", () => {
    expect(board.open).toBe(8);
    expect(board.queue).toEqual({ overdue: 1, today: 1, soon: 2, onTrack: 2, notRunning: 2, acknowledged: 0 });
    expect(Object.values(board.queue).reduce((n, v) => n + v, 0)).toBe(board.open);
    expect(board.waitingId).toBe(1);
    expect(board.paused).toBe(1);
    expect(board.inbox).toBe(3);
  });

  test("gives each client its own counts, inbox and on-time record", () => {
    const [first, second] = board.clients;
    expect(first).toMatchObject({ name: "Example Housing Trust", open: 6, overdue: 1, today: 1, soon: 2, onTrack: 1, notRunning: 1, inbox: 3, measured: 1, met: 1 });
    expect(second).toMatchObject({ name: "Other Client", open: 2, onTrack: 1, notRunning: 1, inbox: 0, measured: 1, met: 0 });
  });

  test("splits open work by type with each type's share", () => {
    expect(board.types.map((t) => [t.type, t.open])).toEqual([["sar", 6], ["complaint", 1], ["erasure", 1]]);
    expect(board.types[0].share).toBeCloseTo(0.75);
  });

  test("lays the due dates on whole weeks from this Monday", () => {
    expect(board.weeks).toHaveLength(5);
    expect(board.weeks[0][0].date).toBe("2026-11-09");
    expect(board.weeks[0][3]).toMatchObject({ date: "2026-11-12", isToday: true });
    expect(board.weeks[0][3].cases.map((c) => c.ref)).toEqual(["EHT-002"]);
    // The complaint shows on the day its acknowledgement is due.
    expect(board.weeks[0][4].cases.map((c) => c.ref)).toEqual(["EHT-007"]);
    expect(board.weeks[0][5].isWeekend).toBe(true);
    expect(board.weeks[1][0].cases.map((c) => c.ref)).toEqual(["EHT-003"]);
    expect(board.weeks[4][6].date).toBe("2026-12-13");
  });

  test("says how many dated cases fall outside the weeks shown; stopped clocks have no date", () => {
    expect(board.dueEarlier).toBe(1);
    expect(board.dueLater).toBe(1);
    const shown = board.weeks.flat().reduce((n, d) => n + d.cases.length, 0);
    expect(shown + board.dueEarlier + board.dueLater).toBe(board.open - board.queue.notRunning);
  });
});
