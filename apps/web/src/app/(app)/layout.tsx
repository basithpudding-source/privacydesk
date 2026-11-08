import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth";

// Everything under (app) needs a signed-in user who belongs to a consultancy.
// Pages that also need a second factor call requireMember() themselves.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.membership) redirect("/welcome");
  return <AppShell user={user}>{children}</AppShell>;
}
