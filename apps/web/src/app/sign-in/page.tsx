import { Brand } from "@/components/brand";
import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendSignInLink } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

type Search = { sent?: string; error?: string; detail?: string; reason?: string };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { sent, error, detail, reason } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center bg-canvas px-4 py-16 sm:px-8">
      <div className="surface mx-auto w-full max-w-md p-6 sm:p-8">
        <Brand />

        {sent ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="mt-3 text-muted-foreground">
              We have sent a sign-in link to <span className="font-medium text-foreground">{sent}</span>.
              It works for one hour. Open it on this device.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Not arrived after a few minutes? Check your spam folder, then{" "}
              <a href="/sign-in" className="underline underline-offset-4">
                ask for another link
              </a>
              . Links are limited to one a minute.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-3 text-muted-foreground">
              Enter your work email and we will send you a link that signs you in. No password needed.
            </p>

            {reason === "idle" && (
              <Alert className="mt-6">
                <AlertTitle>You were signed out after a period of inactivity</AlertTitle>
                <AlertDescription>Nothing was lost. Ask for a new link to carry on.</AlertDescription>
              </Alert>
            )}
            {error === "email" && (
              <Alert variant="destructive" className="mt-6">
                <AlertTitle>That does not look like an email address</AlertTitle>
                <AlertDescription>Check it for typos and try again.</AlertDescription>
              </Alert>
            )}
            {error === "send" && (
              <Alert variant="destructive" className="mt-6">
                <AlertTitle>We could not send the link</AlertTitle>
                <AlertDescription>
                  {detail ? `The email service said: ${detail}.` : "Something went wrong."} Wait a minute and try again.
                </AlertDescription>
              </Alert>
            )}
            {error === "link" && (
              <Alert variant="destructive" className="mt-6">
                <AlertTitle>That link has expired or was already used</AlertTitle>
                <AlertDescription>Ask for a new one below.</AlertDescription>
              </Alert>
            )}

            <form action={sendSignInLink} className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  placeholder="you@consultancy.co.uk"
                />
              </div>
              <Button type="submit" size="lg">Email me a sign-in link</Button>
            </form>
          </>
        )}

        <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Privacy Desk is software, not legal advice. By signing in you agree to the{" "}
          <a href="/terms" className="underline underline-offset-4">terms of use</a>; see also the{" "}
          <a href="/privacy" className="underline underline-offset-4">privacy notice</a>.
        </p>
      </div>
    </main>
  );
}
