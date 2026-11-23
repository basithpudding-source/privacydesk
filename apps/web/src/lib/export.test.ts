import { describe, expect, test } from "vitest";
import { casesSheet, csvCell, exportDocument, exportFileName, toCsv } from "./export";

describe("a spreadsheet cell", () => {
  test("is plain when it can be, and quoted when it holds a comma, a quote or a line break", () => {
    expect(csvCell("Tom Okafor")).toBe("Tom Okafor");
    expect(csvCell("Okafor, Tom")).toBe('"Okafor, Tom"');
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell(false)).toBe("No");
    expect(csvCell(28)).toBe("28");
  });

  test("never lets text from a member of the public run as a formula", () => {
    // Spreadsheet programs run a cell that starts with one of these.
    expect(csvCell("=HYPERLINK(\"http://evil.example\",\"click\")")).toBe("\"'=HYPERLINK(\"\"http://evil.example\"\",\"\"click\"\")\"");
    expect(csvCell("+44 7700 900123")).toBe("'+44 7700 900123");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    // Ordinary text and dates are left alone.
    expect(csvCell("2026-11-23")).toBe("2026-11-23");
  });
});

describe("the cases spreadsheet", () => {
  test("has a heading row, one row per case, and opens with its accents intact", () => {
    const csv = casesSheet([
      {
        ref: "EHT-001",
        type: "sar",
        status: "closed",
        received_on: "2026-10-15",
        channel: "Email",
        requester_name: "Zoë Müller (sample)",
        requester_email: "zoe.muller@example.com",
        summary: "Asks for her file, and call recordings",
        acknowledged_on: "2026-10-16",
        ack_due: null,
        response_due: "2026-11-16",
        closed_on: "2026-11-10",
        outcome: "Response sent",
        met_on_time: true,
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Reference,Type,Status,Received,How it arrived,From,Email,Summary,Acknowledged on,Acknowledge by,Respond by,Closed on,Outcome,Met the legal deadline");
    expect(lines[1]).toBe('EHT-001,sar,closed,2026-10-15,Email,Zoë Müller (sample),zoe.muller@example.com,"Asks for her file, and call recordings",2026-10-16,,2026-11-16,2026-11-10,Response sent,Yes');
  });

  test("is just the heading row when there are no cases", () => {
    expect(toCsv([], [{ heading: "Reference", value: () => "" }]).slice(1)).toBe("Reference\r\n");
  });
});

describe("the whole export", () => {
  const doc = exportDocument({
    organisation: { id: "o1", name: "Example Housing Trust", code: "EHT", region: "scotland", inbound_token: "secret-half-of-the-address", ai_enabled: true },
    cases: [
      { id: "c1", ref: "EHT-001", summary: "First" },
      { id: "c2", ref: "EHT-002", summary: "Second" },
    ],
    events: [
      { id: 1, case_id: "c1", at: "2026-11-01T09:00:00Z", kind: "created", text: "Case logged", actor: "u1" },
      { id: 2, case_id: "c1", at: "2026-11-02T09:00:00Z", kind: "note", text: "Searching", actor: null },
    ],
    pauses: [{ case_id: "c2", paused_on: "2026-11-03", resumed_on: null }],
    messages: [{ id: "m1", subject: "Copy of my records please" }],
    messageEvents: [{ id: 9, inbox_item_id: "m1", at: "2026-11-01T08:00:00Z", kind: "accepted", text: "Accepted into case EHT-001", actor: "u1" }],
    madeAt: "2026-11-23T10:00:00Z",
    madeBy: "olive.owner@example.org",
    who: (actor) => (actor === "u1" ? "Olive Owner" : "system"),
  }) as {
    export: { of: string; made_by: string; counts: Record<string, number> };
    organisation: Record<string, unknown>;
    cases: { ref: string; audit_trail: { by: string; text: string }[]; clock_pauses: unknown[] }[];
    inbox_messages: { log: { by: string }[] }[];
  };

  test("says what it is, who made it and how much it holds", () => {
    expect(doc.export.of).toBe("Example Housing Trust");
    expect(doc.export.made_by).toBe("olive.owner@example.org");
    expect(doc.export.counts).toEqual({ cases: 2, audit_events: 2, inbox_messages: 1 });
  });

  test("puts each case's audit trail and pauses with the case, and names who did what", () => {
    expect(doc.cases[0].audit_trail.map((e) => `${e.by}: ${e.text}`)).toEqual(["Olive Owner: Case logged", "system: Searching"]);
    expect(doc.cases[0].clock_pauses).toEqual([]);
    expect(doc.cases[1].audit_trail).toEqual([]);
    expect(doc.cases[1].clock_pauses).toEqual([{ paused_on: "2026-11-03", resumed_on: null }]);
    expect(doc.inbox_messages[0].log[0].by).toBe("Olive Owner");
  });

  test("leaves out the secret half of the forwarding address", () => {
    expect(doc.organisation).toMatchObject({ name: "Example Housing Trust", code: "EHT", region: "scotland", ai_enabled: true });
    expect(JSON.stringify(doc)).not.toContain("secret-half-of-the-address");
  });
});

describe("the name of the downloaded file", () => {
  test("says whose it is, what it holds and the day, with nothing a computer would reject", () => {
    expect(exportFileName("EHT", "2026-11-23", "json")).toBe("privacy-desk-eht-everything-2026-11-23.json");
    expect(exportFileName("158941", "2026-11-23", "csv")).toBe("privacy-desk-158941-cases-2026-11-23.csv");
    expect(exportFileName('../"; rm', "2026-11-23", "csv")).toBe("privacy-desk-rm-cases-2026-11-23.csv");
    expect(exportFileName("", "2026-11-23", "json")).toBe("privacy-desk-organisation-everything-2026-11-23.json");
  });
});
