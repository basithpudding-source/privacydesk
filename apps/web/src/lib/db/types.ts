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
  created_at: string;
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
  created_at: string;
}
