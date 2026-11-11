// Shapes shared by the confirmation page and its server action ("use server" files export only functions).

export type ConfirmState =
  /** The link was opened; nothing has happened yet. */
  | { status: "ready" }
  /** The link could not be used. */
  | { status: "problem"; title: string; message: string }
  /** The request is with the organisation. `already` means an earlier press sent it. */
  | {
      status: "done";
      already: boolean;
      ref: string;
      receivedOn: string;
      kindLabel: string;
      sentence: string;
      organisationName: string;
      contactEmail: string | null;
    };

export const READY: ConfirmState = { status: "ready" };
