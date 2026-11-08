// One place that knows whether AI is available and which model is used.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const AI_MODEL = "claude-opus-5-5";

/** AI_DISABLED=1 turns AI off for the whole deployment, whatever each client's switch says. */
export function aiDisabled(): boolean {
  return process.env.AI_DISABLED === "1" || process.env.AI_DISABLED === "true";
}

/** True when a server-side key is configured and AI is not switched off. Never exposed to the browser. */
export function aiConfigured(): boolean {
  return !aiDisabled() && Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** A short, honest reason for the screen when a call fails. */
export function describeAiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "The AI key was rejected. Check ANTHROPIC_API_KEY.";
  if (error instanceof Anthropic.RateLimitError) return "The AI service is busy. Try again in a minute.";
  if (error instanceof Anthropic.APIConnectionError) return "The AI service could not be reached.";
  if (error instanceof Anthropic.APIError) return `The AI service returned an error (${error.status}).`;
  return "The AI step failed.";
}
