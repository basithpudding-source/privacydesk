import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/lib/auth";
import { getNavCounts } from "@/lib/nav-counts";

// Everything under (app) needs a signed-in user who belongs to a consultancy.
// Pages that also need a second factor call requireMember() themselves.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.membership) redirect("/welcome");
  const counts = await getNavCounts();
  return (
    <AppShell user={user} counts={counts}>
      {children}
    </AppShell>
  );
}
