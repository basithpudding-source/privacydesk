import "server-only";
import type { DeadlineRow } from "@/lib/cases/types";
import { createClient } from "@/lib/supabase/server";
import { summarise, type DashboardOrg, type DashboardSummary } from "./summary";

/** Everything the dashboard shows, through the user's own session so RLS applies. */
export async function getDashboard(clientId: string, today: string): Promise<{ summary: DashboardSummary; clients: DashboardOrg[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase
    .from("v_case_deadlines")
    .select("case_id, ref, organisation_id, type, status, received_on, clock_state, ack_due, response_due, internal_target, days_left, met_on_time")
    .limit(5000);
  if (clientId) q = q.eq("organisation_id", clientId);
  const [{ data: rows, error }, { data: orgs }] = await Promise.all([q, supabase.from("organisations").select("id, name, colour").order("name")]);
  const clients = (orgs ?? []) as DashboardOrg[];
  if (error) return { summary: summarise([], clients, today), clients, error: error.message };
  const scope = clientId ? clients.filter((o) => o.id === clientId) : clients;
  return { summary: summarise((rows ?? []) as DeadlineRow[], scope, today), clients, error: null };
}
