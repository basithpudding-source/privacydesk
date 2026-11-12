// The client's AI switch must hold for letter drafts as it does for triage: with it off,
// nothing about the case may reach the AI provider.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const anthropic = vi.fn((): unknown => {
  throw new Error("the AI provider was called");
});
const aiConfigured = vi.fn(() => true);
vi.mock("./client", () => ({ AI_MODEL: "test-model", aiConfigured: () => aiConfigured(), anthropic: () => anthropic() }));

import { letterPrompt, letterTemplate, signOff, streamLetter, type LetterFacts } from "./letters";

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
  signerName: "Alex Carter",
  signerTitle: "Data Protection Officer",
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

describe("stopping a draft part way", () => {
  // A stand-in for the AI provider's stream: one piece of text, then nothing until it is stopped.
  function modelStream() {
    let end: (reason: Error) => void = () => {};
    const ended = new Promise<never>((_, reject) => {
      end = reject;
    });
    return {
      abort: vi.fn(() => end(new Error("stopped"))),
      finalMessage: vi.fn(),
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Dear Sam Sample," } };
        await ended;
      },
    };
  }

  it("ends the request to the AI provider and writes nothing more", async () => {
    const model = modelStream();
    anthropic.mockImplementationOnce(() => ({ messages: { stream: () => model } }));
    const reader = streamLetter("ack", facts, true).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("Dear Sam Sample,");

    await reader.cancel();
    expect(model.abort).toHaveBeenCalledTimes(1);
    // Neither the rest of the letter nor the "failed part way" template is asked for.
    expect(model.finalMessage).not.toHaveBeenCalled();
    expect((await reader.read()).done).toBe(true);
  });
});

describe("how a draft is signed", () => {
  it("uses the sender's name and job title from their profile", () => {
    expect(signOff(facts)).toBe("Yours sincerely,\n\nAlex Carter\nData Protection Officer\nExample Housing Trust");
    expect(letterTemplate("ack", facts)).toContain("Yours sincerely,\n\nAlex Carter\nData Protection Officer\nExample Housing Trust\nReference EHT-001");
  });

  it("leaves gaps to fill when the profile has no name or job title", () => {
    const blank = { ...facts, signerName: null, signerTitle: null };
    expect(signOff(blank)).toBe("Yours sincerely,\n\n[Your name]\n[Your job title]\nExample Housing Trust");
    expect(letterTemplate("outcome", blank)).toContain("[Your name]\n[Your job title]");
  });

  it("tells the AI to copy the sign-off, not to guess a title for the person, and not to write a subject", () => {
    const prompt = letterPrompt("ack", facts);
    expect(prompt).toContain("Alex Carter\nData Protection Officer\nExample Housing Trust");
    expect(prompt).toContain("Do not add or guess a title");
    expect(prompt).toContain("Do not write a subject line");
  });
});
