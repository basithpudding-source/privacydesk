// Shapes shared by the public form and its server action ("use server" files export only functions).
import type { RequestKind } from "@/lib/public-form/copy";

export interface RequestFormValues {
  name: string;
  email: string;
  kind: RequestKind | "";
  details: string;
}

export interface RequestFormState {
  status: "editing" | "sent";
  values: RequestFormValues;
  errors: Partial<Record<keyof RequestFormValues | "form", string>>;
  /** Development only, when no email sender is configured: the link that would have been emailed. */
  devLink?: string;
}

export const EMPTY_REQUEST: RequestFormValues = { name: "", email: "", kind: "", details: "" };
