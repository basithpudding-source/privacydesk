import { describe, expect, test } from "vitest";
import { cleanEmail, isRole, memberActions, ROLE_LABELS, ROLES, roleAllows, sortMembers, teamError, type TeamMember } from "./team";

const member = (over: Partial<TeamMember>): TeamMember => ({
  id: "m",
  user_id: "u",
  email: "someone@example.org",
  role: "client_user",
  organisation_id: null,
  created_at: "2026-11-13T09:00:00Z",
  ...over,
});

describe("levels of access", () => {
  test("there are three, each with a name and a sentence for both kinds of desk", () => {
    expect(ROLES).toEqual(["partner_admin", "client_user", "read_only"]);
    for (const r of ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(roleAllows(r, "consultancy")).toMatch(/\.$/);
      expect(roleAllows(r, "organisation")).toMatch(/\.$/);
    }
  });

  test("what an organisation's own team is told never mentions clients", () => {
    for (const r of ROLES) expect(roleAllows(r, "organisation")).not.toMatch(/client/i);
    expect(roleAllows("partner_admin", "consultancy")).toContain("adds clients");
  });

  test("only the known levels are accepted from a form", () => {
    expect(isRole("read_only")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe("the address a person is added by", () => {
  test("is tidied the way the database stores it", () => {
    expect(cleanEmail("  Hana.Handler@Example.ORG ")).toBe("hana.handler@example.org");
  });

  test("must look like an address", () => {
    expect(cleanEmail("hana")).toBeNull();
    expect(cleanEmail("hana@example")).toBeNull();
    expect(cleanEmail("hana handler@example.org")).toBeNull();
    expect(cleanEmail(`${"a".repeat(250)}@example.org`)).toBeNull();
  });
});

describe("the team list", () => {
  test("puts administrators first, then case handlers, then read only, by address", () => {
    const sorted = sortMembers([
      member({ id: "1", role: "read_only", email: "a@example.org" }),
      member({ id: "2", role: "client_user", email: "z@example.org" }),
      member({ id: "3", role: "partner_admin", email: "m@example.org" }),
      member({ id: "4", role: "client_user", email: "b@example.org" }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["3", "4", "2", "1"]);
  });

  test("does not offer what the database will refuse", () => {
    const me = member({ id: "1", user_id: "me", role: "partner_admin" });
    const hana = member({ id: "2", user_id: "hana", role: "client_user" });
    // The only administrator cannot step down, and nobody removes themselves.
    expect(memberActions(me, [me, hana], "me")).toMatchObject({ canRemove: false, canChangeRole: false });
    expect(memberActions(hana, [me, hana], "me")).toEqual({ canRemove: true, canChangeRole: true, why: null });
    // With a second administrator, either may be changed, but still not removed by themselves.
    const olive = member({ id: "3", user_id: "olive", role: "partner_admin" });
    expect(memberActions(me, [me, hana, olive], "me")).toMatchObject({ canRemove: false, canChangeRole: true });
    expect(memberActions(olive, [me, hana, olive], "me")).toMatchObject({ canRemove: true, canChangeRole: true });
  });
});

describe("a refusal from the database", () => {
  test("is put in words that say what to do", () => {
    expect(teamError({ code: "PGRST202" })).toContain("migration 0022");
    expect(teamError({ code: "42501" })).toContain("administrator");
    expect(teamError({ code: "23505", hint: "member" })).toBe("That person is already in the team.");
    expect(teamError({ code: "23505", hint: "invited" })).toContain("has not signed in yet");
    expect(teamError({ code: "23514", hint: "last_admin" })).toContain("at least one administrator");
    expect(teamError({ code: "23514", hint: "self" })).toContain("cannot remove yourself");
    expect(teamError({ code: "23514" })).toBe("That does not look like an email address.");
    expect(teamError({ code: "XX000", message: "internal detail" })).not.toContain("internal detail");
  });
});
