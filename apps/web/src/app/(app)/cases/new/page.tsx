import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { listClientsForForms } from "@/lib/cases/queries";
import { defaultNewCase } from "./form-state";
import { NewCaseForm } from "./new-case-form";
import { todayInLondon } from "@/lib/today";

export const metadata: Metadata = { title: "Log a case" };

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const user = await requireMember();
  if (user.membership.role === "read_only") redirect("/cases");
  const { client } = await searchParams;
  const clients = await listClientsForForms();
  const today = todayInLondon();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        back={{ href: "/cases", label: "Cases" }}
        title="Log a case by hand"
        description="For a request that arrived by post, phone or an inbox the desk does not watch. The deadline is worked out from the date received."
      />
      {clients.length === 0 ? (
        <p className="mt-6 text-sm">
          Add a client first on the{" "}
          <Link href="/clients/new" className="underline underline-offset-4">
            clients page
          </Link>
          .
        </p>
      ) : (
        <div className="surface mt-6 w-fit max-w-full p-6">
          <NewCaseForm initial={defaultNewCase(client && clients.some((c) => c.id === client) ? client : clients[0].id, today)} clients={clients} />
        </div>
      )}
    </div>
  );
}
