import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import type { Organisation } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";
import { OrganisationSettings } from "../clients/organisation-settings";

export const metadata: Metadata = { title: "Organisation" };

/**
 * An organisation's own desk has one organisation: itself. This is its settings page, where a
 * consultancy would have its list of clients.
 */
export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireMember();
  if (user.membership.kind !== "organisation") redirect("/clients");
  const { saved } = await searchParams;

  const supabase = await createClient();
  // Row-level security returns only this desk's organisation.
  const { data } = await supabase.from("organisations").select("*").order("created_at").limit(1);
  const org = (data?.[0] ?? null) as Organisation | null;
  const isAdmin = user.membership.role === "partner_admin";

  return (
    <div className="w-full">
      <PageHeader
        title={
          org ? (
            <span className="flex items-center gap-3">
              <span className="size-3 rounded-full" style={{ backgroundColor: org.colour }} aria-hidden="true" />
              {org.name}
              <span className="font-mono text-sm font-normal text-muted-foreground">{org.code}</span>
            </span>
          ) : (
            "Organisation"
          )
        }
        description="How your organisation's desk works: where requests come in, the deadlines' bank holidays, how long cases are kept, and whether AI is used."
        actions={
          isAdmin && (
            <Button variant="outline" size="lg" render={<Link href="/settings/team" />} nativeButton={false}>
              <Users data-icon="inline-start" aria-hidden="true" />
              Team and access
            </Button>
          )
        }
      />
      {org ? (
        <OrganisationSettings org={org} isAdmin={isAdmin} saved={saved} own />
      ) : (
        <div className="mt-6">
          <EmptyState title="The organisation's settings are missing">Nothing can be logged until they exist. Tell whoever looks after Privacy Desk for you.</EmptyState>
        </div>
      )}
    </div>
  );
}
