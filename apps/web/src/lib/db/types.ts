// Row shapes for the pd schema (supabase/migrations). Hand-written until the Supabase CLI
// can generate them; keep in step with the migrations.

export type Region = "england-and-wales" | "scotland" | "northern-ireland";

export const REGIONS: { value: Region; label: string }[] = [
  { value: "england-and-wales", label: "England and Wales" },
  { value: "scotland", label: "Scotland" },
  { value: "northern-ireland", label: "Northern Ireland" },
];

export type MemberRole = "partner_admin" | "client_user" | "read_only";

export interface Partner {
  id: string;
  name: string;
  /** 'consultancy' or 'organisation' (migration 0022); see lib/desk.ts. */
  kind: string;
  created_at: string;
}

export interface Organisation {
  id: string;
  partner_id: string;
  name: string;
  code: string;
  colour: string;
  region: Region;
  internal_target_days: number;
  retention_months: number;
  ai_enabled: boolean;
  /** Secret part of the client's forwarding address (slice 4). */
  inbound_token: string;
  /** Public form (slice 5): whether /r/<code> takes requests, and who confirmations name. */
  form_enabled: boolean;
  contact_email: string | null;
  created_at: string;
}

/** The public form's address for a client. APP_URL is the deployed origin; in development it is localhost. */
export function publicFormUrl(org: Pick<Organisation, "code">): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/r/${org.code.toLowerCase()}`;
}

/** The forwarding address for a client, or null until INBOUND_DOMAIN is set. */
export function forwardingAddress(org: Pick<Organisation, "code" | "inbound_token">): string | null {
  const domain = process.env.INBOUND_DOMAIN;
  return domain ? `${org.code.toLowerCase()}-${org.inbound_token}@${domain}` : null;
}

export interface Member {
  id: string;
  user_id: string;
  partner_id: string;
  organisation_id: string | null;
  role: MemberRole;
  /** The address the person signs in with, kept so the team page can name them (0022). */
  email: string | null;
  created_at: string;
}
