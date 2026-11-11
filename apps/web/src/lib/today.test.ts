import { describe, expect, it } from "vitest";
import { londonDate } from "./today";

describe("the date in London", () => {
  it("is the UTC date in winter", () => {
    expect(londonDate(new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-11");
    expect(londonDate(new Date("2026-11-12T00:30:00Z"))).toBe("2026-11-12");
  });

  it("is a day ahead of UTC between midnight and 1am in British Summer Time", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London.
    expect(londonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(londonDate(new Date("2026-06-30T22:59:00Z"))).toBe("2026-06-30");
  });

  it("reads timestamp strings as the database returns them", () => {
    expect(londonDate("2026-06-30T23:30:00+00:00")).toBe("2026-07-01");
    expect(londonDate("2026-12-31T23:59:59.123456+00:00")).toBe("2026-12-31");
  });

  it("handles the clock changes", () => {
    expect(londonDate(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-28"); // still GMT
    expect(londonDate(new Date("2026-03-29T23:30:00Z"))).toBe("2026-03-30"); // BST began that morning
    expect(londonDate(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-25"); // last night of BST
    expect(londonDate(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25"); // back on GMT
  });
});
