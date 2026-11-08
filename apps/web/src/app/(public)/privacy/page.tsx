import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" summary="How Privacy Desk uses personal information, and who is responsible for it.">
      <h2>Two kinds of people use Privacy Desk</h2>
      <p>If you work for a consultancy that uses Privacy Desk, read “Consultancy users”. If you have made a complaint or request to an organisation that uses Privacy Desk, read “Members of the public”.</p>

      <h2>Members of the public</h2>
      <p>When you fill in a request form or email a forwarding address, the organisation named on that form is responsible for your personal information: it is the controller. Privacy Desk is the software that organisation, or the consultancy acting for it, uses to handle your request. We ([Company name]) are a processor: we store and display your request on their instructions and do nothing else with it.</p>
      <ul>
        <li><strong>What is held:</strong> your name, your email address, what you asked for, the text you wrote, the date, and the organisation’s notes and letters about your request.</li>
        <li><strong>Why:</strong> so the organisation can answer you within the time the law allows, and keep a record that it did.</li>
        <li><strong>Email verification:</strong> when you use a request form we email you a one-time link to prove the address is yours. Nothing is sent to the organisation until you open it. Unverified forms are deleted a week after the link expires.</li>
        <li><strong>Automated help:</strong> the organisation may use a language model to suggest what kind of request yours is and to draft a reply. A person checks every suggestion; no decision about you is made automatically.</li>
        <li><strong>How long:</strong> for as long as the organisation’s retention period says (its default is 36 months after the case closes), then your case is deleted.</li>
        <li><strong>Your rights:</strong> you can ask the organisation for a copy of your information, to correct it, or to delete it, and you can complain to the Information Commissioner’s Office (ICO) at ico.org.uk or on 0303 123 1113. Contact the organisation first: it holds your information and can act on it.</li>
      </ul>

      <h2>Consultancy users</h2>
      <p>For your own account we are the controller.</p>
      <ul>
        <li><strong>What we hold:</strong> your email address, the consultancy you belong to and your role in it, the time of your sign-ins, your authenticator enrolment (not the secret itself, which only your app holds), and an audit record of the actions you take on cases.</li>
        <li><strong>Why, and on what basis:</strong> to provide the service you have asked for (performance of a contract), to keep it secure (our legitimate interest), and to show who did what on a case (the legitimate interest of your clients in a reliable audit trail).</li>
        <li><strong>How long:</strong> while you have an account, then [12] months. Audit records stay with the cases they belong to, for the client’s retention period.</li>
        <li><strong>Your rights:</strong> access, correction, erasure (except audit records, which cannot be edited), restriction, portability and objection. Email [contact email]. You can complain to the ICO.</li>
      </ul>

      <h2>Who else sees the information</h2>
      <p>The companies that host and run parts of the service, listed on the <a href="/sub-processors">sub-processors</a> page. Data is stored in the United Kingdom. The language model provider is in the United States; see that page for the safeguards.</p>

      <h2>Security</h2>
      <p>Data is encrypted in transit and at rest. Each client organisation’s data is separated by access rules enforced in the database. Administrators must use a second factor. Audit records cannot be edited or deleted by anyone.</p>

      <h2>Contact</h2>
      <p>[Company name], [registered address], [contact email]. ICO registration number [number].</p>
    </LegalPage>
  );
}
