import "server-only";
import type { DeadlineRow } from "@/lib/cases/types";
import { createClient } from "@/lib/supabase/server";
import { liveBoard, type LiveBoard } from "./live";
import { summarise, type DashboardOrg, type DashboardSummary } from "./summary";

/** Everything the dashboard shows, through the user's own session so RLS applies. */
export async function getDashboard(clientId: string, today: string): Promise<{ summary: DashboardSummary; live: LiveBoard; clients: DashboardOrg[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase
    .from("v_case_deadlines")
    .select("case_id, ref, organisation_id, type, status, received_on, clock_state, ack_due, response_due, internal_target, days_left, met_on_time")
    .limit(5000);
  if (clientId) q = q.eq("organisation_id", clientId);
  const [{ data: rows, error }, { data: orgs }, { data: waiting }] = await Promise.all([
    q,
    supabase.from("organisations").select("id, name, colour").order("name"),
    // Inbox messages nobody has decided yet, to count per client.
    supabase.from("inbox_items").select("organisation_id").eq("status", "new").limit(5000),
  ]);
  const clients = (orgs ?? []) as DashboardOrg[];
  const inbox = new Map<string, number>();
  for (const w of waiting ?? []) inbox.set(w.organisation_id as string, (inbox.get(w.organisation_id as string) ?? 0) + 1);
  if (error) return { summary: summarise([], clients, today), live: liveBoard([], clients, inbox, today), clients, error: error.message };
  const scope = clientId ? clients.filter((o) => o.id === clientId) : clients;
  const data = (rows ?? []) as DeadlineRow[];
  return { summary: summarise(data, scope, today), live: liveBoard(data, scope, inbox, today), clients, error: null };
}
