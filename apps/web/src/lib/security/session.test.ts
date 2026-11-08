import { describe, expect, it } from "vitest";
import { isIdle } from "./session";

const HOUR = 60 * 60 * 1000;

describe("idle sessions", () => {
  it("ends a session idle for longer than the limit", () => {
    expect(isIdle(0 + 1, 9 * HOUR, 8)).toBe(true);
  });
  it("keeps a session that was active within the limit", () => {
    expect(isIdle(2 * HOUR, 9 * HOUR, 8)).toBe(false);
  });
  it("treats a missing or unreadable stamp as the first request, not as idle", () => {
    expect(isIdle(null, 9 * HOUR, 8)).toBe(false);
    expect(isIdle(NaN, 9 * HOUR, 8)).toBe(false);
  });
});
