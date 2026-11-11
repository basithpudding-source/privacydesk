import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { triage } from "@/lib/ai/triage";
import type { Region } from "@/lib/clocks";
import { longDate } from "@/lib/clocks";
import { sendEmail } from "@/lib/email/send";
import { confirmationEmail, requestKindLabel, responseDates, type RequestKind } from "@/lib/public-form/copy";
import { formServerKey, hashToken, looksLikeToken } from "@/lib/public-form/tokens";
import { lookupClient } from "@/lib/public-form/queries";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata: Metadata = { title: "Request confirmed" };

interface Verified {
  ref: string;
  received_on: string;
  request_type: RequestKind;
  requester_name: string;
  requester_email: string;
  details: string;
  organisation_name: string;
  colour: string;
  region: Region;
  contact_email: string | null;
  ai_enabled: boolean;
  inbox_item_id: string;
  already_verified: boolean;
}

// The link in the email lands here. Verifying marks the submission, creates the inbox item,
// triages it and emails the confirmation, all once: opening the link again only shows the
// confirmation again.
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params;
  const { t } = await searchParams;
  const client = await lookupClient(code);
  if (!client) notFound();

  if (!looksLikeToken(t)) return <Problem client={client} title="This link is not complete">Open the link from the email again, or copy it whole into the address bar.</Problem>;

  const serverKey = formServerKey();
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("form_verify", { p_code: code, p_token_hash: hashToken(t), p_server_key: serverKey ?? "" });
  if (error) {
    if (error.code === "22023") return <Problem client={client} title="This link has expired">Links work for 24 hours. Fill in the form again and we will send a new one.</Problem>;
    if (error.code === "P0002") return <Problem client={client} title="This link is not recognised">Check that you opened the most recent email, or fill in the form again.</Problem>;
    return <Problem client={client} title="Something went wrong">We could not confirm your request. Try the link again in a minute.</Problem>;
  }
  const v = ((data as Verified[] | null) ?? [])[0];
  if (!v) return <Problem client={client} title="This link is not recognised">Fill in the form again and we will send a new one.</Problem>;

  // Bank holidays for the client's region, so the response date is worked out as the case page will.
  const { data: holidayRows } = await supabase.from("bank_holidays").select("day").eq("region", v.region);
  const holidays = new Set((holidayRows ?? []).map((h) => h.day as string));

  if (!v.already_verified) {
    // Triage now, so the item is already proposed when the consultancy opens the inbox.
    const outcome = await triage({ text: v.details, organisationName: v.organisation_name, receivedOn: v.received_on, aiEnabled: v.ai_enabled });
    await supabase.rpc("form_set_triage", { p_token_hash: hashToken(t), p_triage: { ...outcome.result, fallbackReason: outcome.fallbackReason }, p_server_key: serverKey ?? "" });
    const message = confirmationEmail({
      ref: v.ref,
      kind: v.request_type,
      receivedOn: v.received_on,
      region: v.region,
      organisationName: v.organisation_name,
      requesterName: v.requester_name,
      contactEmail: v.contact_email,
      holidays,
    });
    await sendEmail({ to: v.requester_email, subject: message.subject, text: message.text });
  }

  const { sentence } = responseDates(v.request_type, v.received_on, v.region, holidays);

  return (
    <div className="mx-auto w-full max-w-[65ch]">
      <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: v.colour }} aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">{v.organisation_name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{v.already_verified ? "Your request was already sent" : "Your request has been sent"}</h1>
      <p className="mt-3 text-muted-foreground">Thank you for confirming your email address. Keep the reference below; a copy has been emailed to you.</p>

      <dl className="mt-8 grid grid-cols-[9rem_1fr] gap-y-3 rounded-lg border border-border p-5 text-sm">
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-mono text-base font-semibold">{v.ref}</dd>
        <dt className="text-muted-foreground">Received</dt>
        <dd>{longDate(v.received_on)}</dd>
        <dt className="text-muted-foreground">What you asked for</dt>
        <dd>{requestKindLabel(v.request_type)}</dd>
        <dt className="text-muted-foreground">What happens next</dt>
        <dd>
          {sentence} If they need to check who you are first, the time runs from when they receive that proof; they will tell you if so.
        </dd>
        <dt className="text-muted-foreground">Questions</dt>
        <dd>{v.contact_email ? <>Email {v.contact_email} and quote your reference.</> : <>Contact {v.organisation_name} and quote your reference.</>}</dd>
      </dl>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        {v.organisation_name} is responsible for handling your request. If you are unhappy with how it is handled, you can complain to the Information Commissioner&apos;s Office (ICO) at ico.org.uk.
      </p>
    </div>
  );
}

function Problem({ client, title, children }: { client: { name: string; code: string; colour: string }; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[65ch]">
      <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: client.colour }} aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">{client.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{children}</p>
      <p className="mt-6">
        <Link href={`/r/${client.code.toLowerCase()}`} className="underline underline-offset-4">
          Go to the form
        </Link>
      </p>
    </div>
  );
}
