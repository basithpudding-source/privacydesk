import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { addClient } from "../actions";
import { ClientForm } from "../client-form";
import { DEFAULT_CLIENT } from "../form-state";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  const user = await requireMember();
  if (user.membership.role !== "partner_admin") redirect("/clients");

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/clients" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Clients
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Add client</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        An organisation {user.membership.partnerName} looks after. You can change everything except the code later.
      </p>
      <ClientForm action={addClient} initial={DEFAULT_CLIENT} submitLabel="Add client" />
    </div>
  );
}
