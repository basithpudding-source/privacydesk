import Link from "next/link";
import { LegalLinks } from "@/components/legal-page";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-16 sm:px-8">
      <div className="mx-auto w-full max-w-[65ch]">
        <p className="text-sm font-medium text-muted-foreground">Privacy Desk</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Complaints and subject access requests, with the deadlines worked out
          for you.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          A case desk for data protection consultancies looking after many client
          organisations.
        </p>
        <div className="mt-8">
          <Button render={<Link href="/sign-in" />} nativeButton={false}>
            Sign in
          </Button>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          Privacy Desk is software, not legal advice. Deadlines follow published
          ICO guidance; the organisation remains responsible for its responses.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          <LegalLinks />
        </p>
      </div>
    </main>
  );
}
