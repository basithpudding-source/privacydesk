import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Sub-processors" };

const ROWS = [
  { name: "Supabase", purpose: "Database, authentication, storage of all case data", location: "London, United Kingdom (AWS eu-west-2)", data: "All data in the service", terms: "Supabase DPA" },
  { name: "[Hosting provider, e.g. Vercel]", purpose: "Runs the web application", location: "[Region: set to London or EU]", data: "Data in transit while pages are served; server logs", terms: "[Provider DPA]" },
  { name: "Anthropic", purpose: "Language model for triage suggestions and letter drafts, only for clients with AI switched on", location: "United States", data: "The text of a message or draft and the organisation’s name; no account data", terms: "Anthropic commercial terms and DPA; no training on API data" },
  { name: "Resend", purpose: "Sends email: verification links, confirmations, reminders to consultancy staff", location: "[Region]", data: "Recipient email address and the message text", terms: "Resend DPA" },
  { name: "Postmark (ActiveCampaign)", purpose: "Receives email sent to clients’ forwarding addresses", location: "United States", data: "Inbound email content and sender address", terms: "Postmark DPA" },
];

export default function SubProcessorsPage() {
  return (
    <LegalPage title="Sub-processors" summary="The companies that process personal data on our behalf to run Privacy Desk. We give notice before this list changes, as the data processing terms describe.">
      <table>
        <thead>
          <tr>
            <th>Who</th>
            <th>What for</th>
            <th>Where</th>
            <th>What data</th>
            <th>Terms</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.name}>
              <td className="font-medium">{r.name}</td>
              <td>{r.purpose}</td>
              <td>{r.location}</td>
              <td>{r.data}</td>
              <td>{r.terms}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted-foreground">Before launch: confirm each provider’s data processing agreement is accepted, record the date, and fill in the hosting and email regions. Postmark is used only if inbound email forwarding is switched on.</p>
    </LegalPage>
  );
}
