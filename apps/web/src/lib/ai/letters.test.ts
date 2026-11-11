// The client's AI switch must hold for letter drafts as it does for triage: with it off,
// nothing about the case may reach the AI provider.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const anthropic = vi.fn(() => {
  throw new Error("the AI provider was called");
});
const aiConfigured = vi.fn(() => true);
vi.mock("./client", () => ({ AI_MODEL: "test-model", aiConfigured: () => aiConfigured(), anthropic: () => anthropic() }));

import { letterTemplate, streamLetter, type LetterFacts } from "./letters";

const facts: LetterFacts = {
  organisation: "Example Housing Trust",
  ref: "EHT-001",
  typeLabel: "Subject access request",
  requesterName: "Sam Sample",
  receivedOn: "2026-11-02",
  summary: "Wants a copy of their file",
  dueOn: "2026-12-02",
  outcome: null,
  isComplaint: false,
};

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("letter drafts and the client's AI switch", () => {
  beforeEach(() => {
    anthropic.mockClear();
    aiConfigured.mockReturnValue(true);
  });

  it("returns the template and never calls the AI provider when the client has AI off", async () => {
    const text = await read(streamLetter("ack", facts, false));
    expect(text).toBe(letterTemplate("ack", facts));
    expect(anthropic).not.toHaveBeenCalled();
  });

  it("returns the template when AI is off or unconfigured for the deployment", async () => {
    aiConfigured.mockReturnValue(false);
    const text = await read(streamLetter("clarify", facts, true));
    expect(text).toBe(letterTemplate("clarify", facts));
    expect(anthropic).not.toHaveBeenCalled();
  });

  it("uses the AI provider only when both the client and the deployment allow it", () => {
    expect(() => streamLetter("ack", facts, true)).toThrow("the AI provider was called");
    expect(anthropic).toHaveBeenCalledTimes(1);
  });
});
