import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import type { Organisation } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { OrganisationSettings } from "../organisation-settings";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireMember();
  // An organisation's own desk has no clients: its one organisation has its own page.
  if (user.membership.kind === "organisation") redirect("/organisation");
  const { id } = await params;
  const { saved } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("*").eq("id", id).maybeSingle();
  // Row-level security hides other partners' clients, so a wrong id looks like a missing one.
  if (!data) notFound();
  const client = data as Organisation;
  const isAdmin = user.membership.role === "partner_admin";
  // How much would go if the client were deleted. Counted only for the person who could do it.
  const count = (table: "cases" | "inbox_items", open = false) => {
    const q = supabase.from(table).select("id", { count: "exact", head: true }).eq("organisation_id", client.id);
    return open ? q.eq("status", "open") : q;
  };
  const [held, stillOpen, messages] = isAdmin ? await Promise.all([count("cases"), count("cases", true), count("inbox_items")]) : [null, null, null];
  const counts = held ? { cases: held.count ?? 0, open: stillOpen?.count ?? 0, inbox: messages?.count ?? 0 } : undefined;

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

      <OrganisationSettings org={client} isAdmin={isAdmin} saved={saved} own={false} counts={counts} />
    </div>
  );
}
