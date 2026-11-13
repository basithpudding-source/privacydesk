import { describe, expect, test } from "vitest";
import { COLUMNS_VERSION } from "@/lib/prefs";
import { BUILT_IN_VIEWS, cleanViewParams, sameFilters, viewHref } from "./views";

describe("case list views", () => {
  test("a view's address lists its filters in a fixed order", () => {
    expect(viewHref({})).toBe("/cases");
    expect(viewHref({ dir: "desc", sort: "received", type: "sar", status: "overdue" })).toBe("/cases?status=overdue&type=sar&sort=received&dir=desc");
  });

  test("stored values are cut down to the known keys", () => {
    expect(cleanViewParams({ status: "overdue", type: "sar", evil: "<script>", q: 12, columns: ["status", "nope", "client"], columnsVersion: COLUMNS_VERSION })).toEqual({
      status: "overdue",
      type: "sar",
      columns: ["status", "client"],
      columnsVersion: COLUMNS_VERSION,
    });
    expect(cleanViewParams("not an object")).toEqual({});
    expect(cleanViewParams({ q: "x".repeat(500) })).toEqual({});
  });

  test("the default status and a direction without a sort are dropped, so equal views compare equal", () => {
    expect(cleanViewParams({ status: "open", dir: "desc" })).toEqual({});
    expect(sameFilters({ status: "open" }, {})).toBe(true);
    expect(sameFilters({ sort: "received", dir: "asc" }, { sort: "received" })).toBe(true);
    expect(sameFilters({ sort: "received", dir: "desc" }, { sort: "received" })).toBe(false);
  });

  test("a view saved before a column existed shows that column; one saved since keeps it hidden", () => {
    // Saved views from before the Subject column carry no version.
    expect(cleanViewParams({ columns: ["status", "summary"] })).toEqual({ columns: ["status", "subject", "summary"], columnsVersion: COLUMNS_VERSION });
    // Cleaning again (as saving does) must not bring a hidden column back.
    const hidden = cleanViewParams({ columns: ["status", "summary"], columnsVersion: COLUMNS_VERSION });
    expect(hidden.columns).toEqual(["status", "summary"]);
    expect(cleanViewParams(hidden).columns).toEqual(["status", "summary"]);
  });

  test("built-in views have unique ids and names", () => {
    expect(new Set(BUILT_IN_VIEWS.map((v) => v.id)).size).toBe(BUILT_IN_VIEWS.length);
    expect(new Set(BUILT_IN_VIEWS.map((v) => v.name)).size).toBe(BUILT_IN_VIEWS.length);
    expect(new Set(BUILT_IN_VIEWS.map((v) => viewHref(v.params))).size).toBe(BUILT_IN_VIEWS.length);
  });
});
