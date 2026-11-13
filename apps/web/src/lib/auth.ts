// Data-access layer for "who is signed in and which desk are they in".
// Pages call these instead of touching Supabase auth directly, so the rules live in one place.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/db/types";
import { deskKindOf, type DeskKind } from "@/lib/desk";

export type AssuranceLevel = "aal1" | "aal2";

export interface Membership {
  partnerId: string;
  partnerName: string;
  /** A consultancy with clients, or an organisation's own team (lib/desk.ts). */
  kind: DeskKind;
  role: MemberRole;
  /** Null means access to every client of the partner. */
  organisationId: string | null;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  /** The name the person gave on their profile page, if any. */
  name: string | null;
  /** Their job title from the profile page, used to sign letters. */
  jobTitle: string | null;
  /** aal2 means the user passed a second factor this session. */
  assurance: AssuranceLevel;
  /** aal2 means the user has enrolled a second factor. */
  enrolled: boolean;
  membership: Membership | null;
}

/** The signed-in user, or null. Cached per request so layouts and pages share one read. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return null;

  const [{ data: aal }, { data: memberRows }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("members").select("partner_id, role, organisation_id").limit(1),
  ]);

  let membership: Membership | null = null;
  const member = memberRows?.[0];
  if (member) {
    // Every column, so this still reads a desk from before it had a kind (migration 0022).
    const { data: partner } = await supabase
      .from("partners")
      .select("*")
      .eq("id", member.partner_id)
      .maybeSingle();
    membership = {
      partnerId: member.partner_id,
      partnerName: partner?.name ?? "Your desk",
      kind: deskKindOf(partner?.kind),
      role: member.role as MemberRole,
      organisationId: member.organisation_id,
    };
  }

  return {
    id: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    name: displayName(claims.user_metadata),
    jobTitle: jobTitle(claims.user_metadata),
    assurance: aal?.currentLevel === "aal2" ? "aal2" : "aal1",
    enrolled: aal?.nextLevel === "aal2",
    membership,
  };
});

/** The display name kept in the user's own sign-in record; trimmed and capped. */
export function displayName(metadata: unknown): string | null {
  return profileText(metadata, "display_name");
}

/** The job title kept beside the display name, used to sign letters. */
export function jobTitle(metadata: unknown): string | null {
  return profileText(metadata, "job_title");
}

function profileText(metadata: unknown, key: string): string | null {
  const v = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[key] : null;
  // One line only: these go into letters and the top bar.
  return typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, 80) : null;
}

/** Redirects to sign-in when nobody is signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Whether a membership covers the whole desk, which is what two-step sign-in is asked for. */
export function seesWholeDesk(m: Pick<Membership, "role" | "organisationId">): boolean {
  return m.role === "partner_admin" || m.organisationId === null;
}

/**
 * For app pages: the user must be signed in, belong to a desk, and, if they can see the whole
 * of it, have passed their second factor (the database asks the same: migration 0022). Each
 * missing piece has its own page.
 */
export async function requireMember(): Promise<CurrentUser & { membership: Membership }> {
  const user = await requireUser();
  if (!user.membership) redirect("/welcome");
  if (seesWholeDesk(user.membership) && user.assurance !== "aal2") {
    redirect(user.enrolled ? "/mfa" : "/settings/security");
  }
  return { ...user, membership: user.membership };
}

/** For pages only an administrator may open: anyone else is sent to their own profile. */
export async function requireAdmin(): Promise<CurrentUser & { membership: Membership }> {
  const user = await requireMember();
  if (user.membership.role !== "partner_admin") redirect("/settings/profile");
  return user;
}
