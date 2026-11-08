// Keyword back-up, used when AI is off for the client, not configured, or failing.
// Ported from the prototype. Deliberately simple: it points, a person decides.
import { cleanTriage, type TriageResult, type TriageType } from "./triage-types";

const LISTS: [TriageType, string[]][] = [
  ["sar", ["subject access", "copy of my", "copy of the information", "everything you have", "all the information", "all information you hold", "information you hold", "copy of all", "data you hold", "what you hold about me", "on file about me", "access to my"]],
  ["complaint", ["complain", "without my consent", "without asking", "never agreed", "shared my", "told my", "passed on my", "breach", "not happy", "unhappy", "embarrass", "data protection"]],
  ["erasure", ["delete my", "erase", "remove my details", "remove my data", "right to be forgotten"]],
  ["rectification", ["correct my", "wrong address", "incorrect", "update my details"]],
  ["objection", ["stop using my", "stop sending", "object to", "unsubscribe"]],
];

export function keywordTriage(text: string): TriageResult {
  const t = text.toLowerCase();
  const scored = LISTS.map(([type, words]) => [type, words.filter((w) => t.includes(w))] as const).sort(
    (a, b) => b[1].length - a[1].length,
  );
  const [topType, topHits] = scored[0];
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) ?? [])[0] ?? null;

  if (topHits.length === 0) {
    return cleanTriage(
      { type: "not_dp", confidence: 0.4, summary: "No data protection wording found. Read it yourself.", requesterEmail: email, reasons: [] },
      "keywords",
    );
  }
  return cleanTriage(
    {
      type: topType,
      also: scored.slice(1).filter((s) => s[1].length > 0).map((s) => s[0]),
      confidence: Math.min(0.85, 0.45 + 0.12 * topHits.length),
      summary: "Matched keywords; check the message yourself.",
      requesterEmail: email,
      reasons: topHits.map((w) => `“${w}”`),
    },
    "keywords",
  );
}
