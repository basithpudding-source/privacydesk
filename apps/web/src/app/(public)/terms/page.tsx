import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" summary="The agreement between [Company name] and the consultancies that use Privacy Desk.">
      <h2>1. Who we are</h2>
      <p>Privacy Desk is provided by [Company name], registered in England and Wales, company number [number], at [registered address] (“we”, “us”). You can contact us at [contact email].</p>

      <h2>2. What Privacy Desk is</h2>
      <p>Privacy Desk is a hosted case desk for data protection consultancies. It records complaints and requests from members of the public to your client organisations, works out the legal response dates from published ICO guidance, drafts letters for a person to check and send, and produces reports.</p>
      <p><strong>Privacy Desk is software, not legal advice.</strong> It applies published rules to the dates and facts you enter. Whether a response is lawful, complete or on time remains the responsibility of the client organisation and of you as its adviser. Check every date and every draft before you rely on it.</p>

      <h2>3. Your account</h2>
      <ul>
        <li>You are a consultancy (a “partner”) and the people you add are your members. You are responsible for who you add and for removing them when they leave.</li>
        <li>Partner administrators can see every client’s data, so they must enrol an authenticator app. Privacy Desk refuses to show an administrator any data until a second factor has been given.</li>
        <li>Sessions end after [8] hours without activity. Keep your sign-in email account secure: anyone who can read it can sign in.</li>
      </ul>

      <h2>4. Your clients’ data</h2>
      <p>The personal data you and your clients put into Privacy Desk belongs to your client organisations, which are the controllers. You act for them, and we process it on your instructions as a processor. The <a href="/dpa">data processing terms</a> set out how. We never use it for any other purpose, and we never train or allow others to train models on it.</p>
      <p>Each client organisation’s data is kept separate from every other’s by access rules enforced in the database, not only in the application.</p>

      <h2>5. Artificial intelligence</h2>
      <p>Privacy Desk can use a large language model to classify incoming messages and to draft letters. The model only proposes: a person confirms every classification and sends every letter. You can switch AI off for any client at any time, and we can switch it off for the whole service. The provider and its terms are listed on the <a href="/sub-processors">sub-processors</a> page.</p>

      <h2>6. Acceptable use</h2>
      <ul>
        <li>Use Privacy Desk only to handle data protection complaints and requests for your clients.</li>
        <li>Do not enter data you have no right to process, and do not use the public form or forwarding addresses to collect data for any other purpose.</li>
        <li>Do not attempt to read another consultancy’s data, probe the service for weaknesses without our written agreement, or overload it.</li>
      </ul>

      <h2>7. Fees</h2>
      <p>[Pricing: per client organisation per month, billed to the partner. Trial period. Payment terms. What happens on non-payment.]</p>

      <h2>8. Availability and support</h2>
      <p>We aim to keep Privacy Desk available at all times but do not promise it. We tell you about planned maintenance in advance where we can. Support is by email at [support email] on working days.</p>

      <h2>9. Our responsibility</h2>
      <p>We are responsible for providing the service with reasonable skill and care. We are not responsible for a deadline missed because a date or fact was entered wrongly, for the content of a letter a person chose to send, or for the decisions of a client organisation. Nothing in these terms limits liability that cannot be limited by law. Otherwise our total liability to you in any year is limited to the fees you paid us in that year. [Review with a solicitor.]</p>

      <h2>10. Ending the agreement</h2>
      <p>You can stop using Privacy Desk at any time by telling us. We can end the agreement with [30] days’ notice, or at once if you break these terms. When it ends you can export your data, and we delete it within [30] days as the data processing terms describe.</p>

      <h2>11. Changes</h2>
      <p>We may change these terms. We will tell you by email at least [30] days before a change that affects you takes effect.</p>

      <h2>12. Law</h2>
      <p>These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.</p>
    </LegalPage>
  );
}
