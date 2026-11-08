// Streams a letter draft for a case as plain text. Copy only; nothing is sent from here.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { LETTER_KINDS, streamLetter, type LetterKind } from "@/lib/ai/letters";
import { typeLabel } from "@/lib/cases/labels";
import { getCase } from "@/lib/cases/queries";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.membership) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { caseId?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON with caseId and kind." }, { status: 400 });
  }
  const kind = String(body.kind ?? "") as LetterKind;
  if (!(kind in LETTER_KINDS)) return NextResponse.json({ error: "Unknown letter kind." }, { status: 400 });
  const detail = typeof body.caseId === "string" ? await getCase(body.caseId) : null;
  if (!detail) return NextResponse.json({ error: "That case is not here." }, { status: 404 });

  const { c, org, deadline } = detail;
  const stream = streamLetter(kind, {
    organisation: org.name,
    ref: c.ref,
    typeLabel: typeLabel(c.type),
    requesterName: c.requester_name,
    receivedOn: c.received_on,
    summary: c.summary,
    dueOn: c.type === "complaint" ? deadline.ack_due : deadline.response_due,
    outcome: c.outcome,
    isComplaint: c.type === "complaint",
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
