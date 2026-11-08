// Transactional email: the verification link and the confirmation a requester asked for by
// filling in the form. This is not case correspondence: letters to requesters are still copied
// and sent by a person (CLAUDE.md). Resend when RESEND_API_KEY is set; otherwise the message is
// printed to the server log so development works without an account.
import "server-only";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type SendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "not-configured" | "failed"; detail?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(email: Email): Promise<SendResult> {
  if (!emailConfigured()) {
    console.log(`[email not configured] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error(`[email] Resend returned ${res.status}: ${detail}`);
      return { sent: false, reason: "failed", detail };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id ?? null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[email] ${detail}`);
    return { sent: false, reason: "failed", detail };
  }
}

/** True only in development with no sender: the page may then show the link instead of emailing it. */
export function showLinksOnPage(): boolean {
  return process.env.NODE_ENV !== "production" && !emailConfigured();
}
