import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface NavCounts {
  /** Inbox items nobody has decided yet. */
  inbox: number;
  /** Open cases past their legal deadline, counted as the case list's "Overdue" filter does. */
  overdue: number;
}

/**
 * The two numbers shown in the navigation. Both go through the signed-in user's own client,
 * so row-level security decides what is counted; a failed count shows as nothing, not an error.
 */
export async function getNavCounts(): Promise<NavCounts> {
  const supabase = await createClient();
  const [inbox, overdue] = await Promise.all([
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("v_case_deadlines").select("case_id", { count: "exact", head: true }).eq("status", "open").lt("days_left", 0),
  ]);
  return { inbox: inbox.count ?? 0, overdue: overdue.count ?? 0 };
}
