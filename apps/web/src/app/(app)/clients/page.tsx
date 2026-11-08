import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireMember } from "@/lib/auth";
import { REGIONS, type Organisation } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organisations")
    .select("id, name, code, colour, region, internal_target_days, retention_months, ai_enabled")
    .order("name");
  const clients = (data ?? []) as Organisation[];
  const isAdmin = user.membership.role === "partner_admin";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The organisations {user.membership.partnerName} looks after.
          </p>
        </div>
        {isAdmin && <Button render={<Link href="/clients/new" />}>Add client</Button>}
      </div>

      {error ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          The client list could not be loaded: {error.message}. Reload the page.
        </p>
      ) : clients.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No clients yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "Add the first organisation you look after. Each client gets its own public form and report."
              : "A partner administrator adds clients."}
          </p>
          {isAdmin && (
            <Button className="mt-4" render={<Link href="/clients/new" />}>
              Add client
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">Target</TableHead>
                <TableHead className="text-right">Retention</TableHead>
                <TableHead>AI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: c.colour }} aria-hidden="true" />
                      {c.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/clients/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{REGIONS.find((r) => r.value === c.region)?.label ?? c.region}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.internal_target_days} days</TableCell>
                  <TableCell className="text-right tabular-nums">{c.retention_months} months</TableCell>
                  <TableCell>
                    {c.ai_enabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
