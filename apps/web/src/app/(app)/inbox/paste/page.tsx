import type { Metadata } from "next";
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
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/inbox" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Inbox
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Paste an email</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        For a message that reached you another way. It is triaged at once and lands in the inbox for you to accept or decline.
      </p>
      {clients.length === 0 ? (
        <p className="text-sm">
          Add a client first on the{" "}
          <Link href="/clients/new" className="underline underline-offset-4">
            clients page
          </Link>
          .
        </p>
      ) : (
        <PasteForm clients={clients} />
      )}
    </div>
  );
}
