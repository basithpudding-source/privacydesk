import { describe, expect, test } from "vitest";
import { whoDid, type Person } from "./people";

const people = new Map<string, Person>([
  ["11111111-aaaa", { name: "Hana Handler", email: "hana.handler@example.org", left: false }],
  ["22222222-bbbb", { name: null, email: "rae.reader@example.org", left: false }],
  ["33333333-cccc", { name: "Olive Owner", email: "olive.owner@example.org", left: true }],
  ["44444444-dddd", { name: null, email: null, left: false }],
]);

describe("who did something, on a log", () => {
  test("is you, the system, or a colleague by the name they chose", () => {
    expect(whoDid("11111111-aaaa", "11111111-aaaa", people)).toBe("you");
    expect(whoDid(null, "me", people)).toBe("system");
    expect(whoDid("11111111-aaaa", "me", people)).toBe("Hana Handler");
  });

  test("falls back to the address, then to plain words, when no name was given", () => {
    expect(whoDid("22222222-bbbb", "me", people)).toBe("rae.reader@example.org");
    expect(whoDid("44444444-dddd", "me", people)).toBe("a team member");
  });

  test("still names someone who has left, and says they have", () => {
    expect(whoDid("33333333-cccc", "me", people)).toBe("Olive Owner (no longer in the team)");
  });

  test("shows a short id only when the directory does not know the person", () => {
    expect(whoDid("99999999-eeee-ffff", "me", people)).toBe("user 99999999");
    expect(whoDid("11111111-aaaa", "me", new Map())).toBe("user 11111111");
  });
});
