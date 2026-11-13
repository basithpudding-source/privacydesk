import { describe, expect, test } from "vitest";
import { COLUMNS_VERSION, DEFAULT_CASE_COLUMNS, DEFAULT_PREFS, parsePrefs, serialisePrefs, themeClass } from "./prefs";

describe("preferences cookie", () => {
  test("nothing stored gives the defaults", () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("")).toEqual(DEFAULT_PREFS);
  });

  test("round-trips what was saved", () => {
    const p = { ...DEFAULT_PREFS, theme: "dark" as const, nav: "side" as const, openCases: "new" as const, caseColumns: ["status" as const, "client" as const] };
    expect(parsePrefs(serialisePrefs(p))).toEqual(p);
  });

  test("ignores anything it does not know, so a tampered cookie cannot inject values", () => {
    const raw = encodeURIComponent(JSON.stringify({ theme: "pink", density: "<script>", nav: 3, caseColumns: ["status", "password", "client"], columnsVersion: COLUMNS_VERSION, extra: true }));
    expect(parsePrefs(raw)).toEqual({ ...DEFAULT_PREFS, caseColumns: ["status", "client"] });
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(encodeURIComponent("[1,2]"))).toEqual(DEFAULT_PREFS);
  });

  test("columns keep the table's order and never end up empty", () => {
    const raw = encodeURIComponent(JSON.stringify({ caseColumns: ["received", "status"], columnsVersion: COLUMNS_VERSION }));
    expect(parsePrefs(raw).caseColumns).toEqual(["status", "received"]);
    expect(parsePrefs(encodeURIComponent(JSON.stringify({ caseColumns: [] }))).caseColumns).toEqual(DEFAULT_CASE_COLUMNS);
  });

  test("a column added later shows for someone who chose their columns before it existed", () => {
    // Saved before the Subject column: no version in the cookie. Their own choices are kept.
    const before = encodeURIComponent(JSON.stringify({ caseColumns: ["status", "from", "client"] }));
    expect(parsePrefs(before).caseColumns).toEqual(["status", "from", "subject", "client"]);
    const garbled = encodeURIComponent(JSON.stringify({ caseColumns: ["status"], columnsVersion: "2" }));
    expect(parsePrefs(garbled).caseColumns).toEqual(["status", "subject"]);
  });

  test("but stays hidden once they have hidden it", () => {
    const p = { ...DEFAULT_PREFS, caseColumns: DEFAULT_CASE_COLUMNS.filter((k) => k !== "subject") };
    expect(parsePrefs(serialisePrefs(p)).caseColumns).not.toContain("subject");
  });

  test("the theme class", () => {
    expect(themeClass("dark")).toBe("dark");
    expect(themeClass("system")).toBe("theme-system");
    expect(themeClass("light")).toBe("");
  });
});
