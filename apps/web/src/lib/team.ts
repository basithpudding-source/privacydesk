// The team: who is in a desk, and what each level of access lets a person do. The database
// holds the levels as roles (pd.members.role) and enforces them; this file is the wording
// and the checks a form can make before asking the database.
import type { MemberRole } from "@/lib/db/types";
import type { DeskKind } from "@/lib/desk";

/** The levels of access, most powerful first. */
export const ROLES: MemberRole[] = ["partner_admin", "client_user", "read_only"];

export const ROLE_LABELS: Record<MemberRole, string> = {
  partner_admin: "Administrator",
  client_user: "Case handler",
  read_only: "Read only",
};

/** One sentence on what a level of access allows, for the kind of desk the person is in. */
export function roleAllows(role: MemberRole, kind: DeskKind): string {
  const cases = kind === "organisation" ? "every case" : "every client's cases";
  switch (role) {
    case "partner_admin":
      return kind === "organisation"
        ? `Sees and changes ${cases}, changes the organisation's settings, and adds or removes people.`
        : `Sees and changes ${cases}, adds clients, and adds or removes people.`;
    case "client_user":
      return kind === "organisation"
        ? `Sees and changes ${cases}. Cannot change settings or the team.`
        : `Sees and changes ${cases}. Cannot add clients or change the team.`;
    case "read_only":
      return "Reads cases and the inbox. Cannot change anything.";
  }
}

export function isRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

/** A work email address, tidied as the database will store it; null when it does not look like one. */
export function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export interface TeamMember {
  id: string;
  user_id: string;
  email: string | null;
  role: MemberRole;
  /** Null means the whole desk; an id means one client only (not offered on the team page yet). */
  organisation_id: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  created_at: string;
}

export interface TeamEvent {
  id: number;
  at: string;
  actor_email: string | null;
  text: string;
}

/** Administrators first, then case handlers, then read only; by address within each. */
export function sortMembers<T extends Pick<TeamMember, "role" | "email">>(members: T[]): T[] {
  return [...members].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || (a.email ?? "").localeCompare(b.email ?? ""));
}

/**
 * What an administrator may do to one member, so the page does not offer what the database
 * will refuse: nobody removes themselves, and a desk keeps at least one administrator.
 */
export function memberActions(member: Pick<TeamMember, "user_id" | "role" | "organisation_id">, all: Pick<TeamMember, "role" | "organisation_id">[], selfId: string): { canRemove: boolean; canChangeRole: boolean; why: string | null } {
  const admins = all.filter((m) => m.role === "partner_admin" && m.organisation_id === null).length;
  const lastAdmin = member.role === "partner_admin" && member.organisation_id === null && admins <= 1;
  const self = member.user_id === selfId;
  return {
    canRemove: !self,
    canChangeRole: !lastAdmin,
    why: lastAdmin ? "The only administrator. Make someone else an administrator before changing this." : self ? "This is you. Another administrator can remove you." : null,
  };
}

/** The message for a refusal from the team functions (migration 0022), by Postgres error code and hint. */
export function teamError(error: { code?: string; message?: string; hint?: string | null }): string {
  // PGRST202 / 42883: the function is not there; PGRST205 / 42P01: nor is the table.
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "PGRST205" || error.code === "42P01") {
    return "The database needs migration 0022 before the team can be changed.";
  }
  if (error.code === "42501") return "Only an administrator who has entered their authenticator code can change the team.";
  if (error.hint === "member") return "That person is already in the team.";
  if (error.hint === "invited") return "That person has already been added and has not signed in yet.";
  if (error.hint === "last_admin") return "A desk needs at least one administrator. Make someone else an administrator first.";
  if (error.hint === "self") return "You cannot remove yourself. Ask another administrator.";
  if (error.code === "P0002") return "That person is no longer there. Reload the page.";
  if (error.code === "54000") return "Fifty people are waiting to sign in. Withdraw one before adding another.";
  if (error.code === "23514") return "That does not look like an email address.";
  return "The team could not be changed. Try again in a minute.";
}
