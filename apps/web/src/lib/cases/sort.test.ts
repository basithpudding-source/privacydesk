import { describe, expect, test, vi } from "vitest";

// queries.ts is server-only and reads the database; the sort itself is plain data.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { parseFilters, sortRows } from "./queries";
import type { CaseListRow } from "./types";

function row(over: Partial<CaseListRow>): CaseListRow {
  return {
    case_id: over.ref ?? "x",
    ref: "AAA-0001",
    organisation_id: "o",
    type: "sar",
    status: "open",
    received_on: "2026-11-01",
    clock_state: "running",
    ack_due: null,
    response_due: "2026-12-01",
    internal_target: null,
    days_left: 10,
    met_on_time: null,
    requester_name: "Someone",
    requester_email: null,
    channel: "Email",
    acknowledged_on: null,
    subject: null,
    summary: null,
    organisation_name: "Client",
    organisation_code: "AAA",
    organisation_colour: "#000000",
    ...over,
  };
}

describe("sorting the case list by a column", () => {
  const rows = [
    row({ ref: "AAA-0010", requester_name: "Tom", received_on: "2026-11-03", days_left: 4, acknowledged_on: "2026-11-04" }),
    row({ ref: "AAA-0002", requester_name: "aisha", received_on: "2026-11-09", days_left: -7 }),
    row({ ref: "AAA-0003", requester_name: null, received_on: "2026-10-05", days_left: null, clock_state: "paused", response_due: null }),
  ];
  const refs = (r: CaseListRow[]) => r.map((x) => x.ref);

  test("references sort by their number, not letter by letter", () => {
    expect(refs(sortRows(rows, "ref", "asc"))).toEqual(["AAA-0002", "AAA-0003", "AAA-0010"]);
    expect(refs(sortRows(rows, "ref", "desc"))).toEqual(["AAA-0010", "AAA-0003", "AAA-0002"]);
  });

  test("names ignore capital letters", () => {
    expect(refs(sortRows(rows, "from", "asc")).slice(0, 2)).toEqual(["AAA-0002", "AAA-0010"]);
  });

  test("status sorts by days left, most overdue first", () => {
    expect(refs(sortRows(rows, "status", "asc"))[0]).toBe("AAA-0002");
  });

  test("rows with nothing in the column go last in both directions", () => {
    expect(refs(sortRows(rows, "deadline", "asc")).at(-1)).toBe("AAA-0003");
    expect(refs(sortRows(rows, "deadline", "desc")).at(-1)).toBe("AAA-0003");
    expect(refs(sortRows(rows, "acknowledged", "desc"))[0]).toBe("AAA-0010");
  });

  test("subject lines ignore capital letters, and cases logged by hand (no subject) go last", () => {
    const bySubject = [
      row({ ref: "AAA-0010", subject: "stop calling me" }),
      row({ ref: "AAA-0002", subject: null }),
      row({ ref: "AAA-0003", subject: "Request for a copy of my personal data (WEB-1)" }),
    ];
    expect(refs(sortRows(bySubject, "subject", "asc"))).toEqual(["AAA-0003", "AAA-0010", "AAA-0002"]);
    expect(refs(sortRows(bySubject, "subject", "desc"))).toEqual(["AAA-0010", "AAA-0003", "AAA-0002"]);
    expect(parseFilters({ sort: "subject" })).toMatchObject({ sort: "subject" });
  });

  test("an unknown sort in the address is ignored", () => {
    expect(parseFilters({ sort: "password", dir: "sideways" })).toMatchObject({ sort: "", dir: "asc" });
    expect(parseFilters({ sort: "received", dir: "desc" })).toMatchObject({ sort: "received", dir: "desc" });
  });
});
