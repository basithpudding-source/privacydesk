import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth";
import { createPartner } from "./actions";

export const metadata: Metadata = { title: "Welcome" };

type Search = { error?: string; detail?: string };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  if (user.membership) redirect("/clients");
  const { error, detail } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-16 sm:px-8">
      <div className="mx-auto w-full max-w-md">
        <p className="text-sm font-medium text-muted-foreground">Privacy Desk</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Name your consultancy</h1>
        <p className="mt-3 text-muted-foreground">
          You are signed in as <span className="font-medium text-foreground">{user.email}</span>.
          Give your consultancy a name to set up its desk. You will be its administrator.
        </p>

        {error === "name" && (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>The name needs 2 to 120 characters</AlertTitle>
            <AlertDescription>Use the name clients would recognise.</AlertDescription>
          </Alert>
        )}
        {error === "create" && (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>We could not set up the consultancy</AlertTitle>
            <AlertDescription>{detail ?? "Something went wrong."} Try again.</AlertDescription>
          </Alert>
        )}

        <form action={createPartner} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Consultancy name</Label>
            <Input id="name" name="name" required minLength={2} maxLength={120} autoFocus placeholder="Example Data Protection Ltd" />
          </div>
          <Button type="submit">Set up the desk</Button>
        </form>

        <form action="/auth/sign-out" method="post" className="mt-8">
          <Button type="submit" variant="link" className="px-0">
            Not you? Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
