// The client's AI switch must hold for the sent-email summary as it does for triage and
// letters: with it off, the email's text must not reach the AI provider.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
const aiConfigured = vi.fn(() => true);
const aiDisabled = vi.fn(() => false);
vi.mock("./client", () => ({
  AI_MODEL: "test-model",
  aiConfigured: () => aiConfigured(),
  aiDisabled: () => aiDisabled(),
  anthropic: () => ({ messages: { create } }),
  describeAiError: () => "The AI step failed.",
}));

import { summariseSentEmail } from "./sent-summary";

const text = "Thank you for your request, which we received on 15 October 2026. We will respond by 16 November 2026.";
const base = { text, organisationName: "Example Housing Trust", aiEnabled: true };

describe("the AI summary of a sent email", () => {
  beforeEach(() => {
    create.mockReset();
    aiConfigured.mockReturnValue(true);
    aiDisabled.mockReturnValue(false);
  });

  it("never calls the AI provider when the client has AI off", async () => {
    expect(await summariseSentEmail({ ...base, aiEnabled: false })).toEqual({ summary: null, reason: "AI is switched off for this organisation." });
    expect(create).not.toHaveBeenCalled();
  });

  it("never calls the AI provider when AI is off or unconfigured for the deployment", async () => {
    aiDisabled.mockReturnValue(true);
    expect((await summariseSentEmail(base)).summary).toBeNull();
    aiDisabled.mockReturnValue(false);
    aiConfigured.mockReturnValue(false);
    expect((await summariseSentEmail(base)).summary).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the model's sentence on one line, and caps its length", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Acknowledged the request\nand gave a response date." }] });
    expect(await summariseSentEmail(base)).toEqual({ summary: "Acknowledged the request and gave a response date.", reason: null });
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "x".repeat(900) }] });
    expect((await summariseSentEmail(base)).summary?.length).toBe(400);
  });

  it("sends only a capped amount of the email's text", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "A summary." }] });
    await summariseSentEmail({ ...base, text: "word ".repeat(5000) });
    const sent = create.mock.calls[0][0].messages[0].content as string;
    expect(sent.length).toBeLessThan(8300);
  });

  it("falls back, with a reason, when the model declines or the call fails", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect(await summariseSentEmail(base)).toEqual({ summary: null, reason: "The AI declined to summarise this email." });
    create.mockRejectedValue(new Error("network"));
    expect(await summariseSentEmail(base)).toEqual({ summary: null, reason: "The AI step failed." });
  });
});
