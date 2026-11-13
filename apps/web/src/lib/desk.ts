// The two kinds of desk. A consultancy handles cases for client organisations. An
// organisation's own team handles the organisation's cases, and nothing in its desk is called
// a "client": there is one organisation, so there is nothing to choose between.
//
// Every word that differs between the two is here, so a screen asks this file instead of
// deciding for itself. The kind is pd.partners.kind (migration 0022).

export const DESK_KINDS = ["consultancy", "organisation"] as const;
export type DeskKind = (typeof DESK_KINDS)[number];

/** Anything unknown is a consultancy, as every desk was before there were two kinds. */
export function deskKindOf(raw: unknown): DeskKind {
  return raw === "organisation" ? "organisation" : "consultancy";
}

export interface DeskWords {
  kind: DeskKind;
  /** Whether there are client organisations to choose between, filter by and report on. */
  hasClients: boolean;
  /** What the desk is, in a sentence: "consultancy" or "organisation". */
  desk: string;
  /** The fifth section of the navigation: the clients, or the organisation's own settings. */
  section: { label: string; href: string; goTo: string };
  /** Whose personal data is being protected, as in "It protects … if your email is ever compromised". */
  whoseData: string;
  /** Where incoming messages come from, for the empty inbox. */
  inboxSource: string;
  /** What the monthly report is for. */
  reportPurpose: string;
  /** The line that opens the nightly reminder email. */
  reminderLead: (deskName: string) => string;
}

const WORDS: Record<DeskKind, DeskWords> = {
  consultancy: {
    kind: "consultancy",
    hasClients: true,
    desk: "consultancy",
    section: { label: "Clients", href: "/clients", goTo: "Go to clients" },
    whoseData: "every client's data",
    inboxSource: "New messages land here from each client's forwarding address and public form, or paste one by hand.",
    reportPurpose: "What to send the client this month: one page, plain English, copy or PDF.",
    reminderLead: (name) => `Legal deadlines for ${name}'s clients`,
  },
  organisation: {
    kind: "organisation",
    hasClients: false,
    desk: "organisation",
    section: { label: "Organisation", href: "/organisation", goTo: "Go to the organisation's settings" },
    whoseData: "the personal data in your cases",
    inboxSource: "New messages land here from your forwarding address and public form, or paste one by hand.",
    reportPurpose: "The month in one page, in plain English, to copy or save as a PDF.",
    reminderLead: (name) => `Legal deadlines for ${name}`,
  },
};

export function deskWords(kind: DeskKind): DeskWords {
  return WORDS[kind];
}
