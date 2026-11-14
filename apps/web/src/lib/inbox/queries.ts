import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { InboxItemRow, InboxListRow } from "./types";

export async function listInbox(view: "new" | "decided"): Promise<{ rows: InboxListRow[]; error: string | null }> {
  const supabase = await createClient();
  let q = supabase.from("inbox_items").select("*").order("received_at", { ascending: false }).limit(200);
  q = view === "new" ? q.eq("status", "new") : q.neq("status", "new");
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  const items = (data ?? []) as InboxItemRow[];
  if (items.length === 0) return { rows: [], error: null };

  const caseIds = items.map((i) => i.case_id).filter((x): x is string => Boolean(x));
  const [{ data: orgs }, { data: cases }] = await Promise.all([
    supabase.from("organisations").select("id, name, code, colour"),
    caseIds.length ? supabase.from("cases").select("id, ref").in("id", caseIds) : Promise.resolve({ data: [] as { id: string; ref: string }[] }),
  ]);
  const orgById = new Map((orgs ?? []).map((o) => [o.id as string, o]));
  const refById = new Map((cases ?? []).map((c) => [c.id as string, c.ref as string]));
  return {
    rows: items.map((i) => {
      const o = orgById.get(i.organisation_id);
      return {
        ...i,
        organisation_name: (o?.name as string) ?? "",
        organisation_code: (o?.code as string) ?? "",
        organisation_colour: (o?.colour as string) ?? "#888888",
        case_ref: i.case_id ? (refById.get(i.case_id) ?? null) : null,
      };
    }),
    error: null,
  };
}

export async function getInboxItem(id: string): Promise<InboxListRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("inbox_items").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const item = data as InboxItemRow;
  const [{ data: org }, caseRow] = await Promise.all([
    supabase.from("organisations").select("id, name, code, colour").eq("id", item.organisation_id).single(),
    item.case_id ? supabase.from("cases").select("ref").eq("id", item.case_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    ...item,
    organisation_name: (org?.name as string) ?? "",
    organisation_code: (org?.code as string) ?? "",
    organisation_colour: (org?.colour as string) ?? "#888888",
    case_ref: (caseRow?.data?.ref as string | undefined) ?? null,
  };
}

export interface InboxEventRow {
  id: number;
  at: string;
  kind: string;
  text: string;
  actor: string | null;
}

/** The log of decisions on a message, newest first. Empty before migration 0019. */
export async function listInboxEvents(itemId: string): Promise<InboxEventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("inbox_events").select("id, at, kind, text, actor").eq("inbox_item_id", itemId).order("id", { ascending: false });
  if (error) return [];
  return (data ?? []) as InboxEventRow[];
}

export interface CaseSourceMessage {
  id: string;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  received_at: string;
  /** The email's own Message-ID (or a fingerprint when it had none), so a reply can join its conversation. */
  message_id: string | null;
}

/**
 * The inbox message a case was made from, if it was (a case logged by hand has none): enough
 * of it to quote under a reply and to keep the person's own subject line.
 */
export async function inboxItemForCase(caseId: string): Promise<CaseSourceMessage | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("inbox_items").select("id, subject, from_name, from_email, received_at, message_id").eq("case_id", caseId).maybeSingle();
  return (data as CaseSourceMessage | null) ?? null;
}
