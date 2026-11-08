import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lookupClient } from "@/lib/public-form/queries";
import { submitRequest } from "./actions";
import { RequestForm } from "./request-form";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const client = await lookupClient((await params).code);
  return { title: client ? `Request form: ${client.name}` : "Request form" };
}

export default async function PublicFormPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const client = await lookupClient(code);
  if (!client) notFound();

  return (
    <div className="mx-auto w-full max-w-[65ch]" style={{ "--client": client.colour } as React.CSSProperties}>
      <div className="h-1.5 w-16 rounded-full" style={{ backgroundColor: client.colour }} aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">{client.name}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Ask about your personal information</h1>
      <p className="mt-3 text-muted-foreground">
        Use this form to ask {client.name} for a copy of the information it holds about you, to complain about how it was handled, or to ask for something else to be done with it.
      </p>

      <div className="mt-8">
        {client.form_enabled ? (
          <RequestForm action={submitRequest.bind(null, client.code)} organisationName={client.name} colour={client.colour} />
        ) : (
          <p className="rounded-lg border border-border p-4">
            {client.name} is not taking requests through this form at the moment.
            {client.contact_email ? <> Email {client.contact_email} instead.</> : <> Contact the organisation directly instead.</>}
          </p>
        )}
      </div>

      <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
        What you enter goes to {client.name}, which is responsible for handling your request and for your personal information. It is stored by Privacy Desk, the software {client.name} uses to manage requests, only for that purpose.
        If you are unhappy with how your request is handled, you can complain to the Information Commissioner&apos;s Office (ICO) at ico.org.uk.
      </p>
    </div>
  );
}
