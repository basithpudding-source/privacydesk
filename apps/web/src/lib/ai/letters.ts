// Letter drafts. AI writes a draft; a person edits and sends it from their own email.
// Nothing here sends anything. Without AI, a template with gaps in square brackets.
import "server-only";
import { AI_MODEL, aiConfigured, anthropic } from "./client";
import { longDate } from "@/lib/clocks";

export const LETTER_KINDS = {
  ack: "acknowledgement",
  id: "request for proof of identity",
  clarify: "request for clarification",
  extend: "notice that the response deadline is being extended to three months",
  outcome: "response explaining the outcome",
} as const;
export type LetterKind = keyof typeof LETTER_KINDS;

export interface LetterFacts {
  organisation: string;
  ref: string;
  typeLabel: string;
  requesterName: string | null;
  receivedOn: string;
  summary: string | null;
  /** The legal date to quote, if the clock is running. */
  dueOn: string | null;
  outcome: string | null;
  isComplaint: boolean;
  /** The person sending the letter, from their profile; null leaves a gap to fill. */
  signerName: string | null;
  signerTitle: string | null;
}

/**
 * How every draft ends: the sender's own name and job title when their profile has them,
 * a gap in square brackets when it does not, then the organisation the letter is from.
 */
export function signOff(f: Pick<LetterFacts, "signerName" | "signerTitle" | "organisation">): string {
  return ["Yours sincerely,", "", f.signerName ?? "[Your name]", f.signerTitle ?? "[Your job title]", f.organisation].join("\n");
}

export function letterPrompt(kind: LetterKind, f: LetterFacts): string {
  const facts = [
    `Organisation: ${f.organisation}`,
    `Case reference: ${f.ref}`,
    `Case type: ${f.typeLabel}`,
    `Requester: ${f.requesterName ?? "unknown"}`,
    `Received: ${longDate(f.receivedOn)}`,
    f.summary ? `Summary: ${f.summary}` : "",
    f.dueOn ? `${f.isComplaint ? "Acknowledge by" : "Respond by"}: ${longDate(f.dueOn)}` : "",
    f.outcome ? `Outcome notes: ${f.outcome}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Write a short ${LETTER_KINDS[kind]} letter from ${f.organisation} for a UK data protection case. Plain English, UK spelling, warm and factual, under 170 words.`,
    "Do not give legal conclusions or admit fault. Do not invent facts: put anything unknown in [square brackets] for staff to fill in.",
    kind === "clarify" ? "Explain that the one-month time limit is paused until the clarification arrives." : "",
    kind === "id" ? "Explain that the time limit starts when proof of identity is received, and suggest two acceptable documents in [square brackets]." : "",
    kind === "extend" ? "Give the reason as [reason for extension] and state the new date." : "",
    "Greet the person by the name given under Requester, exactly as written. Do not add or guess a title such as Mr, Mrs or Ms.",
    "Return only the letter text, starting with the greeting. Do not write a subject line.",
    "End with exactly this sign-off, copied as it is, and nothing after it:",
    signOff(f),
    "Facts:",
    facts,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The no-AI version: a template with gaps, so the desk still works without a key. */
export function letterTemplate(kind: LetterKind, f: LetterFacts): string {
  const name = f.requesterName ?? "[name]";
  const due = f.dueOn ? longDate(f.dueOn) : "[date]";
  const sign = `\n\n${signOff(f)}\nReference ${f.ref}`;
  switch (kind) {
    case "ack":
      return `Dear ${name},\n\nThank you for your ${f.typeLabel.toLowerCase()}, which we received on ${longDate(f.receivedOn)}. We are looking into it now and will ${f.isComplaint ? "respond" : "send you a full response"} by ${due}.\n\nIf you have any questions in the meantime, please reply to this email quoting the reference below.${sign}`;
    case "id":
      return `Dear ${name},\n\nThank you for your request, received on ${longDate(f.receivedOn)}. Before we can share personal information we need to be sure we are dealing with the right person. Please send a copy of [one photo ID, such as a passport or driving licence] and [one proof of address, such as a recent utility bill].\n\nThe one-month time limit for our response starts on the day we receive these.${sign}`;
    case "clarify":
      return `Dear ${name},\n\nThank you for your request, received on ${longDate(f.receivedOn)}. To find the information you want, we need a little more detail: [what you need to know].\n\nThe one-month time limit is paused until we hear back from you, and restarts the day after your reply arrives.${sign}`;
    case "extend":
      return `Dear ${name},\n\nThank you for your request, received on ${longDate(f.receivedOn)}. Because [reason for extension], we need more time to respond fully. The law allows us to extend the time limit by a further two months in such cases, so we will respond by ${due}.\n\nWe are sorry for the delay and will send what we can sooner.${sign}`;
    case "outcome":
      return `Dear ${name},\n\nThank you for your ${f.typeLabel.toLowerCase()}, received on ${longDate(f.receivedOn)}. We have now completed our work on it.\n\n${f.outcome ? f.outcome : "[what was found and what has been done]"}\n\nIf you are not satisfied with this response you can contact us again, or raise the matter with the Information Commissioner's Office (ico.org.uk).${sign}`;
  }
}

/**
 * Streams a draft as plain text chunks. `aiEnabled` is the client's own AI switch
 * (pd.organisations.ai_enabled): when it is off, or AI is off or unconfigured for the whole
 * deployment, nothing about the case leaves the server and the template is returned instead.
 */
export function streamLetter(kind: LetterKind, f: LetterFacts, aiEnabled: boolean): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  if (!aiEnabled || !aiConfigured()) {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(letterTemplate(kind, f)));
        controller.close();
      },
    });
  }
  const stream = anthropic().messages.stream({
    model: AI_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: letterPrompt(kind, f) }],
  });
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[The AI declined to write this draft. Use the template instead.]\n\n" + letterTemplate(kind, f)));
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n[The AI draft failed part way. Here is the template instead.]\n\n" + letterTemplate(kind, f)));
      }
      controller.close();
    },
  });
}
