// Data-access layer for "who is signed in and which consultancy are they in".
// Pages call these instead of touching Supabase auth directly, so the rules live in one place.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/db/types";

export type AssuranceLevel = "aal1" | "aal2";

export interface Membership {
  partnerId: string;
  partnerName: string;
  role: MemberRole;
  /** Null means access to every client of the partner. */
  organisationId: string | null;
}

export interface CurrentUser {
  id: string;
  email: string | null;
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
    const { data: partner } = await supabase
      .from("partners")
      .select("name")
      .eq("id", member.partner_id)
      .maybeSingle();
    membership = {
      partnerId: member.partner_id,
      partnerName: partner?.name ?? "Your consultancy",
      role: member.role as MemberRole,
      organisationId: member.organisation_id,
    };
  }

  return {
    id: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : null,
    assurance: aal?.currentLevel === "aal2" ? "aal2" : "aal1",
    enrolled: aal?.nextLevel === "aal2",
    membership,
  };
});

/** Redirects to sign-in when nobody is signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * For app pages: the user must be signed in, belong to a consultancy, and, if they are a
 * partner admin, have passed their second factor. Each missing piece has its own page.
 */
export async function requireMember(): Promise<CurrentUser & { membership: Membership }> {
  const user = await requireUser();
  if (!user.membership) redirect("/welcome");
  if (user.membership.role === "partner_admin" && user.assurance !== "aal2") {
    redirect(user.enrolled ? "/mfa" : "/settings/security");
  }
  return { ...user, membership: user.membership };
}
