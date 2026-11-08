import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { requireMember } from "@/lib/auth";
import { forwardingAddress, type Organisation } from "@/lib/db/types";
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
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/clients" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Clients
      </Link>
      <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight">
        <span className="size-3 rounded-full" style={{ backgroundColor: client.colour }} aria-hidden="true" />
        {client.name}
        <span className="font-mono text-sm font-normal text-muted-foreground">{client.code}</span>
      </h1>

      {saved && (
        <Alert className="mt-4 max-w-xl">
          <AlertTitle>{saved === "added" ? "Client added." : "Changes saved."}</AlertTitle>
        </Alert>
      )}

      <section aria-labelledby="forwarding-heading" className="mt-6 max-w-xl rounded-lg border border-border p-4">
        <h2 id="forwarding-heading" className="text-sm font-medium">
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

      <div className="mt-6">
        {isAdmin ? (
          <ClientForm action={updateClient.bind(null, client.id)} initial={client} submitLabel="Save changes" />
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
          </dl>
        )}
      </div>
    </div>
  );
}
