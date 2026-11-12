import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { notFound } from "next/navigation";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { requireMember } from "@/lib/auth";
import { forwardingAddress, publicFormUrl, type Organisation } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { updateClient } from "../actions";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireMember();
  const { id } = await params;
  const { saved } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("*").eq("id", id).maybeSingle();
  // Row-level security hides other partners' clients, so a wrong id looks like a missing one.
  if (!data) notFound();
  const client = data as Organisation;
  const isAdmin = user.membership.role === "partner_admin";

  return (
    <div className="w-full">
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        title={
          <span className="flex items-center gap-3">
            <span className="size-3 rounded-full" style={{ backgroundColor: client.colour }} aria-hidden="true" />
            {client.name}
            <span className="font-mono text-sm font-normal text-muted-foreground">{client.code}</span>
          </span>
        }
      />

      {saved && (
        <Alert className="mt-4 max-w-[43rem]">
          <AlertTitle>{saved === "added" ? "Client added." : "Changes saved."}</AlertTitle>
        </Alert>
      )}

      <section aria-labelledby="form-heading" className="surface mt-6 max-w-[43rem] px-6 py-4">
        <h2 id="form-heading" className="section-label">
          Public request form
        </h2>
        <p className="mt-1 font-mono text-sm break-all">
          <a href={publicFormUrl(client)} className="underline underline-offset-4" target="_blank" rel="noreferrer">
            {publicFormUrl(client)}
          </a>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.form_enabled
            ? "Put this link on the client's website or privacy notice. People confirm their email address, then the request lands in the inbox with a reference they have been given."
            : "The form is switched off: visitors see a notice instead. Turn it on below."}
        </p>
      </section>

      <section aria-labelledby="forwarding-heading" className="surface mt-4 max-w-[43rem] px-6 py-4">
        <h2 id="forwarding-heading" className="section-label">
          Forwarding address
        </h2>
        {forwardingAddress(client) ? (
          <>
            <p className="mt-1 font-mono text-sm break-all">{forwardingAddress(client)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask the client to forward requests and complaints here. They land in the inbox, triaged, for you to accept or decline.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Not available yet: no inbound email domain is configured (INBOUND_DOMAIN). The address will be{" "}
            <span className="font-mono">{client.code.toLowerCase()}-{client.inbound_token}@…</span>
          </p>
        )}
      </section>

      <div className="surface mt-4 max-w-[43rem] p-6">
        {isAdmin ? (
          <ClientForm action={updateClient.bind(null, client.id)} initial={{ ...client, contact_email: client.contact_email ?? "" }} submitLabel="Save changes" />
        ) : (
          <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-y-3 text-sm">
            <dt className="text-muted-foreground">Region</dt>
            <dd>{client.region}</dd>
            <dt className="text-muted-foreground">Internal target</dt>
            <dd>{client.internal_target_days} days</dd>
            <dt className="text-muted-foreground">Retention</dt>
            <dd>{client.retention_months} months</dd>
            <dt className="text-muted-foreground">AI</dt>
            <dd>{client.ai_enabled ? "On" : "Off"}</dd>
            <dt className="text-muted-foreground">Public form</dt>
            <dd>{client.form_enabled ? "On" : "Off"}</dd>
            <dt className="text-muted-foreground">Contact email</dt>
            <dd>{client.contact_email ?? "None"}</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
