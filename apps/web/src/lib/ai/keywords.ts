// Keyword back-up, used when AI is off for the client, not configured, or failing.
// Ported from the prototype. Deliberately simple: it points, a person decides.
//
// Each entry is a loose pattern, not an exact phrase: people write "correct it", "what else
// you hold about me" or "stop emailing me", and an exact list of phrases misses them. A miss
// matters more than a false hit here, because a miss shows a real request as "not about
// personal data" and makes it easier to decline by mistake.
import { cleanTriage, type TriageResult, type TriageType } from "./triage-types";

const LISTS: [TriageType, RegExp[]][] = [
  [
    "sar",
    [
      /subject access/,
      /\bd?sar\b/,
      /copy of (my|the|all|any|everything)\b/,
      /everything you (have|hold)/,
      /all (of )?(the |my )?(information|data|records)/,
      /(information|data|records|details) (that )?you (hold|have|keep|store)/,
      /(hold|have|keep|store) (about|on) me\b/,
      /on file about me/,
      /access to my/,
    ],
  ],
  [
    "complaint",
    [/complain/, /without my (consent|permission|knowledge)/, /without asking/, /never agreed/, /shared my/, /told my/, /passed on my/, /breach/, /not happy/, /unhappy/, /embarrass/, /data protection/],
  ],
  [
    "erasure",
    [/delete (my|all|the|any|everything)\b/, /\beras(e|ed|ure)\b/, /remove (all )?(of )?my (details|data|information|account|records)/, /right to be forgotten/],
  ],
  [
    "rectification",
    [
      /correct (my|it|this|that|the|them)\b/,
      /\brectif/,
      /(wrong|old|previous) (address|name|surname|date of birth|phone number|number|details|information)/,
      /incorrect/,
      /inaccurate/,
      /out of date/,
      /update (my|the|your) (details|address|records|information|name)/,
      /misspel/,
    ],
  ],
  [
    "objection",
    [/stop (using|processing|sending|contacting|emailing|calling|texting)/, /object to/, /unsubscribe/, /opt(ed)? out/, /no longer want (to receive|you to)/],
  ],
];

export function keywordTriage(text: string): TriageResult {
  const t = text.toLowerCase();
  // The words that matched, as written in the message, so the reasons quote the person.
  const scored = LISTS.map(([type, patterns]) => [type, patterns.map((p) => t.match(p)?.[0]).filter((m): m is string => Boolean(m))] as const).sort(
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
