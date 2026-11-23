import { Alert, AlertTitle } from "@/components/ui/alert";
import { forwardingAddress, publicFormUrl, REGIONS, type Organisation } from "@/lib/db/types";
import { updateClient } from "./actions";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientForm } from "./client-form";
import { DeleteClient } from "./leaving";

/**
 * Everything about one organisation whose cases the desk handles: its public form, its
 * forwarding address and its settings. For a consultancy this is one client's page; for an
 * organisation's own desk it is the organisation itself, and the wording says "your".
 */
export function OrganisationSettings({
  org,
  isAdmin,
  saved,
  own,
  counts,
}: {
  org: Organisation;
  isAdmin: boolean;
  saved?: string;
  /** The desk's own organisation, not a client. */
  own: boolean;
  /** How much is held for a client, shown before it is deleted. Only a consultancy's administrator needs it. */
  counts?: { cases: number; open: number; inbox: number };
}) {
  const address = forwardingAddress(org);
  return (
    <>
      {saved && (
        <Alert className="mt-4 max-w-[43rem]" role="status">
          <AlertTitle>{saved === "added" ? "Client added." : saved === "set-up" ? "Your desk is set up. Check the settings below, then add your colleagues under Team and access." : "Changes saved."}</AlertTitle>
        </Alert>
      )}

      <section aria-labelledby="form-heading" className="surface mt-6 max-w-[43rem] px-6 py-4">
        <h2 id="form-heading" className="section-label">
          Public request form
        </h2>
        <p className="mt-1 font-mono text-sm break-all">
          <a href={publicFormUrl(org)} className="underline underline-offset-4" target="_blank" rel="noreferrer">
            {publicFormUrl(org)}
          </a>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {org.form_enabled
            ? `Put this link on ${own ? "your" : "the client's"} website or privacy notice. People confirm their email address, then the request lands in the inbox with a reference they have been given.`
            : "The form is switched off: visitors see a notice instead. Turn it on below."}
        </p>
      </section>

      <section aria-labelledby="forwarding-heading" className="surface mt-4 max-w-[43rem] px-6 py-4">
        <h2 id="forwarding-heading" className="section-label">
          Forwarding address
        </h2>
        {address ? (
          <>
            <p className="mt-1 font-mono text-sm break-all">{address}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {own ? "Forward requests and complaints here, or set your mailbox to." : "Ask the client to forward requests and complaints here."} They land in the inbox, triaged, for you to accept or decline.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Not available yet: no inbound email domain is configured (INBOUND_DOMAIN). The address will be{" "}
            <span className="font-mono">
              {org.code.toLowerCase()}-{org.inbound_token}@…
            </span>
          </p>
        )}
      </section>

      <div className="surface mt-4 max-w-[43rem] p-6">
        {isAdmin ? (
          <ClientForm action={updateClient.bind(null, org.id, own ? "/organisation" : null)} initial={{ ...org, contact_email: org.contact_email ?? "" }} submitLabel="Save changes" />
        ) : (
          <>
            <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-y-3 text-sm">
              <dt className="text-muted-foreground">Region</dt>
              <dd>{REGIONS.find((r) => r.value === org.region)?.label ?? org.region}</dd>
              <dt className="text-muted-foreground">Internal target</dt>
              <dd>{org.internal_target_days} days</dd>
              <dt className="text-muted-foreground">Retention</dt>
              <dd>{org.retention_months} months</dd>
              <dt className="text-muted-foreground">AI</dt>
              <dd>{org.ai_enabled ? "On" : "Off"}</dd>
              <dt className="text-muted-foreground">Public form</dt>
              <dd>{org.form_enabled ? "On" : "Off"}</dd>
              <dt className="text-muted-foreground">Contact email</dt>
              <dd>{org.contact_email ?? "None"}</dd>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">Only an administrator can change these.</p>
          </>
        )}
      </div>

      {isAdmin && (
        <section aria-labelledby="leaving-heading" className="surface mt-4 flex max-w-[43rem] flex-col gap-4 px-6 py-5">
          <div>
            <h2 id="leaving-heading" className="section-label">
              {own ? "Your data, and leaving" : "If this client leaves"}
            </h2>
            <p className="mt-2 text-sm">
              Download everything Privacy Desk holds {own ? "for your organisation" : "for this client"}: every case with its audit trail, and every inbox message. Each download is noted on the team log.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" render={<a href={`/api/export?client=${org.id}&format=json`} download />} nativeButton={false}>
              <Download data-icon="inline-start" aria-hidden="true" />
              Download everything (data file)
            </Button>
            <Button variant="outline" size="lg" render={<a href={`/api/export?client=${org.id}&format=csv`} download />} nativeButton={false}>
              <Download data-icon="inline-start" aria-hidden="true" />
              Download the cases (spreadsheet)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The files contain personal data. Keep them only as long as it takes to hand them over, and send them safely.
          </p>
          {own ? (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              To close this desk and have everything in it deleted, write to whoever provides Privacy Desk to you. Take the download first: nothing can be recovered afterwards.
            </p>
          ) : (
            counts && (
              <div className="border-t border-border pt-4">
                <DeleteClient orgId={org.id} name={org.name} counts={counts} />
              </div>
            )
          )}
        </section>
      )}
    </>
  );
}
