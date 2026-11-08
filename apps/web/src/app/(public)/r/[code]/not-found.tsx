import Link from "next/link";

export default function FormNotFound() {
  return (
    <div className="mx-auto w-full max-w-[65ch]">
      <p className="text-sm font-medium text-muted-foreground">Privacy Desk</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">There is no form at this address</h1>
      <p className="mt-3 text-muted-foreground">Check the link you were given. If it came from an organisation&apos;s website or letter, contact them directly.</p>
      <p className="mt-6 text-sm">
        <Link href="/" className="underline underline-offset-4">
          About Privacy Desk
        </Link>
      </p>
    </div>
  );
}
