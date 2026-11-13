import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireMember } from "@/lib/auth";
import { listClientsForForms } from "@/lib/cases/queries";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import emails" };

export default async function ImportEmailsPage() {
  const user = await requireMember();
  if (user.membership.role === "read_only") redirect("/inbox");
  const clients = await listClientsForForms();

  return (
    <div className="w-full">
      <PageHeader
        back={{ href: "/inbox", label: "Inbox" }}
        title="Import emails"
        description="For requests already sitting in your own mailbox. Add several saved emails at once; each lands in the inbox, triaged, for you to accept or decline."
      />
      {clients.length === 0 ? (
        <p className="mt-6 text-sm">
          {user.membership.kind === "organisation" ? "The organisation's settings are missing. See the" : "Add a client first on the"}{" "}
          <Link href={user.membership.kind === "organisation" ? "/organisation" : "/clients/new"} className="underline underline-offset-4">
            {user.membership.kind === "organisation" ? "organisation page" : "clients page"}
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6">
          <ImportForm clients={clients} />
        </div>
      )}
    </div>
  );
}
