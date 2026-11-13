import { describe, expect, test } from "vitest";
import { deskKindOf, deskWords } from "./desk";

describe("the two kinds of desk", () => {
  test("anything unknown is a consultancy, as every desk was before there were two kinds", () => {
    expect(deskKindOf("organisation")).toBe("organisation");
    expect(deskKindOf("consultancy")).toBe("consultancy");
    expect(deskKindOf(undefined)).toBe("consultancy");
    expect(deskKindOf(null)).toBe("consultancy");
    expect(deskKindOf("Organisation")).toBe("consultancy");
  });

  test("a consultancy has clients and a Clients section", () => {
    const w = deskWords("consultancy");
    expect(w.hasClients).toBe(true);
    expect(w.section).toMatchObject({ label: "Clients", href: "/clients" });
    expect(w.reminderLead("Example DP Ltd")).toBe("Legal deadlines for Example DP Ltd's clients");
  });

  test("nothing an organisation's own team reads says client", () => {
    const w = deskWords("organisation");
    expect(w.hasClients).toBe(false);
    expect(w.section).toMatchObject({ label: "Organisation", href: "/organisation" });
    const said = [w.desk, w.section.label, w.section.goTo, w.whoseData, w.inboxSource, w.reportPurpose, w.reminderLead("Example Housing Trust")].join(" ");
    expect(said).not.toMatch(/client|consultanc/i);
  });
});
