import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { looksLikeToken } from "@/lib/public-form/tokens";
import { lookupClient } from "@/lib/public-form/queries";
import { confirmRequest } from "./actions";
import { ConfirmRequest } from "./confirm-request";

export const metadata: Metadata = { title: "Confirm your request" };

// The link in the email lands here. Opening it changes nothing: the page shows one button,
// and pressing it (a POST to the server action) is what verifies the address, creates the
// inbox item and starts the clock. Mail scanners and link previews open links without
// pressing anything, so they can no longer send a request on someone's behalf.
export default async function VerifyPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string }> }) {
  const { code } = await params;
  const { t } = await searchParams;
  const client = await lookupClient(code);
  if (!client) notFound();

  return (
    <div className="mx-auto w-full max-w-[65ch]">
      <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: client.colour }} aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">{client.name}</p>
      {looksLikeToken(t) ? (
        <ConfirmRequest action={confirmRequest.bind(null, client.code, t)} organisationName={client.name} code={client.code} colour={client.colour} />
      ) : (
        <>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">This link is not complete</h1>
          <p className="mt-3 text-muted-foreground">Open the link from the email again, or copy it whole into the address bar.</p>
          <p className="mt-6">
            <Link href={`/r/${client.code.toLowerCase()}`} className="underline underline-offset-4">
              Go to the form
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
