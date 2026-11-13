import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { listClientsForForms } from "@/lib/cases/queries";
import { PasteForm } from "./paste-form";

export const metadata: Metadata = { title: "Paste an email" };

export default async function PastePage() {
  const user = await requireMember();
  if (user.membership.role === "read_only") redirect("/inbox");
  const clients = await listClientsForForms();

  return (
    <div className="w-full">
      <PageHeader
        back={{ href: "/inbox", label: "Inbox" }}
        title="Paste an email"
        description="For a message that reached you another way. It is triaged at once and lands in the inbox for you to accept or decline."
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
        <div className="surface mt-6 w-full max-w-[43rem] p-6">
          <PasteForm clients={clients} />
        </div>
      )}
    </div>
  );
}
