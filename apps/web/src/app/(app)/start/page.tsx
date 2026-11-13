import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";

// Where sign-in ends up. A consultancy starts from its clients, as it always has; an
// organisation's own team has no clients to choose between, so it starts from its cases.
export default async function StartPage() {
  const user = await requireMember();
  redirect(user.membership.kind === "organisation" ? "/cases" : "/clients");
}
