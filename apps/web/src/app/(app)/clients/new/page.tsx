import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
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
    <div className="w-full">
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        title="Add client"
        description={<>An organisation {user.membership.partnerName} looks after. You can change everything except the code later.</>}
      />
      <div className="surface mt-6 w-full max-w-[43rem] p-6">
        <ClientForm action={addClient} initial={DEFAULT_CLIENT} submitLabel="Add client" />
      </div>
    </div>
  );
}
