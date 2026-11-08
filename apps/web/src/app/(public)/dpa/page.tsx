import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Data processing terms" };

export default function DpaPage() {
  return (
    <LegalPage title="Data processing terms" summary="How [Company name] processes personal data on behalf of the consultancies and client organisations that use Privacy Desk, as Article 28 of the UK GDPR requires.">
      <h2>1. Parties and roles</h2>
      <p>The client organisation is the controller of the personal data in its cases. The consultancy (the partner) acts on the controller’s behalf under its own agreement with the controller. [Company name] (the “provider”) is a processor acting on the documented instructions of the partner and, through it, the controller. These terms form part of the <a href="/terms">terms of use</a>.</p>

      <h2>2. Subject matter, nature and purpose</h2>
      <p>Hosting, storing, displaying and, where switched on, automatically classifying and drafting responses to data protection complaints and requests, so that the controller can respond within the legal time limits and keep a record. Duration: for as long as the partner has an account, plus the deletion period in section 9.</p>

      <h2>3. Data subjects and categories of data</h2>
      <ul>
        <li><strong>Data subjects:</strong> members of the public who complain or make requests to the controller; the controller’s and partner’s staff.</li>
        <li><strong>Data:</strong> names, contact details, the content of complaints and requests, which may include any category of personal data the requester chooses to write, including special category data; dates; notes and letters; audit records of who did what.</li>
      </ul>

      <h2>4. The provider’s obligations</h2>
      <ul>
        <li>Process personal data only on documented instructions: using the service as designed is the instruction. We tell the partner at once if we believe an instruction breaks data protection law.</li>
        <li>Ensure everyone with access is bound by confidentiality.</li>
        <li>Take the security measures in section 6.</li>
        <li>Use sub-processors only as in section 7.</li>
        <li>Help the controller answer data subject requests: the service itself provides the records, and we assist on request.</li>
        <li>Help with security, breach notification, data protection impact assessments and consultation with the ICO, taking into account the nature of the processing.</li>
        <li>Delete or return the data at the end, as in section 9.</li>
        <li>Make available the information needed to show compliance, and allow and contribute to audits as in section 10.</li>
      </ul>

      <h2>5. The partner’s and controller’s obligations</h2>
      <p>The controller is responsible for the lawfulness of the processing, for its privacy notices, for the content of its responses and for the instructions it gives. The partner is responsible for the people it adds to its account and for its own agreement with the controller.</p>

      <h2>6. Security measures</h2>
      <ul>
        <li>Each client organisation’s data is separated by row-level security rules in the database, so no application defect can show one organisation another’s data.</li>
        <li>Partner administrators must use a second factor; the database refuses them access without it. Sessions end after a period of inactivity.</li>
        <li>Encryption in transit (TLS) and at rest, provided by the hosting sub-processor.</li>
        <li>Every change to a case writes an audit record that nobody can edit or delete.</li>
        <li>Least privilege: the browser never holds a privileged key; the public form and inbound email write only through narrow database functions; the one privileged key is used by a single scheduled job on the server.</li>
        <li>Daily backups, with restores tested. [Confirm plan and frequency.]</li>
      </ul>

      <h2>7. Sub-processors</h2>
      <p>The partner gives general authorisation for the sub-processors listed on the <a href="/sub-processors">sub-processors</a> page. We give at least [30] days’ notice by email before adding or replacing one; the partner may object on reasonable grounds, and if we cannot resolve the objection the partner may end the agreement without penalty. We impose the same data protection obligations on each sub-processor and remain responsible for their performance.</p>

      <h2>8. International transfers</h2>
      <p>Data is stored and processed in the United Kingdom. Where AI features are switched on, the text of a message or draft is sent to the language model provider in the United States under the UK International Data Transfer Addendum to the EU standard contractual clauses, and the provider’s terms prohibit training on that data. The partner can switch AI off for any client at any time, and then no data leaves the UK.</p>

      <h2>9. Deletion and return</h2>
      <p>Cases are deleted automatically when each controller’s retention period ends. When the agreement ends, the partner may export its data for [30] days, after which we delete it, except where law requires us to keep it. Backups expire on their own schedule within [35] days.</p>

      <h2>10. Audits</h2>
      <p>Once a year, or after a security incident, the partner may ask for our written answers to reasonable security questions and for the sub-processors’ current certifications. An on-site audit needs [30] days’ notice, a confidentiality agreement, and the partner meets its own costs.</p>

      <h2>11. Personal data breaches</h2>
      <p>We tell the partner without undue delay, and in any case within [48] hours of becoming aware, of a personal data breach affecting its data, with what we know and what we are doing, and we keep the partner informed. The controller decides whether to notify the ICO and data subjects; we help.</p>

      <h2>12. Liability and law</h2>
      <p>The liability provisions and the governing law of the <a href="/terms">terms of use</a> apply to these terms.</p>
    </LegalPage>
  );
}
