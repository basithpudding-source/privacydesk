import type { Metadata } from "next";
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
      <Link href="/cases" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Cases
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Log a case by hand</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        For a request that arrived by post, phone or an inbox the desk does not watch. The deadline is worked out from the date received.
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
        <NewCaseForm initial={defaultNewCase(client && clients.some((c) => c.id === client) ? client : clients[0].id, today)} clients={clients} />
      )}
    </div>
  );
}
