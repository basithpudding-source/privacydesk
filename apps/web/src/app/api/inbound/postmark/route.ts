// Inbound email from Postmark. Each client has a forwarding address <code>-<token>@<domain>;
// the token is the credential for the database functions, so no service key lives here.
// A shared secret on the URL (or HTTP basic auth) keeps strangers from posting fake mail.
import { NextResponse, type NextRequest } from "next/server";
import { triage } from "@/lib/ai/triage";
import { createAnonClient } from "@/lib/supabase/anon";
import { todayInLondon } from "@/lib/today";

interface PostmarkInbound {
  FromName?: string;
  From?: string;
  Subject?: string;
  TextBody?: string;
  StrippedTextReply?: string;
  HtmlBody?: string;
  MessageID?: string;
  MailboxHash?: string;
  OriginalRecipient?: string;
  ToFull?: { Email?: string; MailboxHash?: string }[];
}

function authorised(request: NextRequest): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;
  if (request.nextUrl.searchParams.get("secret") === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    try {
      const [, password] = Buffer.from(auth.slice(6), "base64").toString("utf8").split(":");
      return password === secret;
    } catch {
      return false;
    }
  }
  return false;
}

/** The token from <code>-<token>@domain, or Postmark's plus-address hash. */
function tokenFrom(m: PostmarkInbound): string | null {
  const hash = m.MailboxHash || m.ToFull?.[0]?.MailboxHash;
  if (hash) return hash.trim();
  const to = m.OriginalRecipient || m.ToFull?.[0]?.Email || "";
  const local = to.split("@")[0] ?? "";
  const dash = local.indexOf("-");
  return dash > 0 ? local.slice(dash + 1).trim().toLowerCase() : null;
}

function stripHtml(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });

  let m: PostmarkInbound;
  try {
    m = (await request.json()) as PostmarkInbound;
  } catch {
    return NextResponse.json({ ok: false, error: "Expected Postmark's inbound JSON." }, { status: 400 });
  }
  const token = tokenFrom(m);
  const body = (m.TextBody || m.StrippedTextReply || (m.HtmlBody ? stripHtml(m.HtmlBody) : "")).trim();
  // 200 for things we will never want retried: Postmark re-posts anything else for days.
  if (!token) return NextResponse.json({ ok: false, reason: "No forwarding token in the address." });
  if (!body) return NextResponse.json({ ok: false, reason: "Empty message." });

  const supabase = createAnonClient();

  const { data: ctx } = await supabase.rpc("inbound_context", { p_token: token }).maybeSingle();
  if (!ctx) return NextResponse.json({ ok: false, reason: "Unknown forwarding address." });

  const { data: itemId, error } = await supabase.rpc("receive_inbound_email", {
    p_token: token,
    p_from_name: m.FromName ?? null,
    p_from_email: m.From ?? null,
    p_subject: m.Subject ?? null,
    p_body: body.slice(0, 50000),
    p_message_id: m.MessageID ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!itemId) return NextResponse.json({ ok: true, duplicate: true });

  const outcome = await triage({
    text: body,
    organisationName: (ctx as { organisation_name: string }).organisation_name,
    receivedOn: todayInLondon(),
    aiEnabled: Boolean((ctx as { ai_enabled: boolean }).ai_enabled),
  });
  await supabase.rpc("set_inbox_triage", { p_token: token, p_item_id: itemId, p_triage: { ...outcome.result, fallbackReason: outcome.fallbackReason } });

  return NextResponse.json({ ok: true, itemId });
}
