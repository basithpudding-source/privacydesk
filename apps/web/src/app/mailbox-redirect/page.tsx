import type { Metadata } from "next";
import { Bridge } from "./bridge";

export const metadata: Metadata = { title: "Signing in" };

// Where Microsoft sends its sign-in pop-up when someone connects their mailbox. The page does
// one thing: pass the answer to the window that opened it. It shows no case data, needs no
// Privacy Desk sign-in, and is never cached (next.config.ts), because the address it is
// opened at carries a one-time code.
export default function MailboxRedirectPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Bridge />
    </main>
  );
}
