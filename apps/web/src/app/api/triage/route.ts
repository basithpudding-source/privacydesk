// Message in, triage JSON out. For a signed-in member; the inbox and the paste form use it.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { triage } from "@/lib/ai/triage";
import { createClient } from "@/lib/supabase/server";
import { todayInLondon } from "@/lib/today";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.membership) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { text?: unknown; organisationId?: unknown; receivedOn?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with text and organisationId." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const organisationId = typeof body.organisationId === "string" ? body.organisationId : "";
  const receivedOn = typeof body.receivedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedOn) ? body.receivedOn : todayInLondon();
  if (text.length < 10) return NextResponse.json({ error: "Paste the message first; it needs at least a sentence." }, { status: 400 });
  if (text.length > 20000) return NextResponse.json({ error: "That message is too long. Paste the relevant part." }, { status: 400 });

  // Row-level security decides whether this user may see the client at all.
  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("id, name, ai_enabled").eq("id", organisationId).maybeSingle();
  if (!org) return NextResponse.json({ error: "That organisation is not one of yours." }, { status: 404 });

  const outcome = await triage({ text, organisationName: org.name as string, receivedOn, aiEnabled: Boolean(org.ai_enabled) });
  return NextResponse.json(outcome);
}
