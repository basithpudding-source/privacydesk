// Shapes shared by the client form and its server actions. Kept out of actions.ts
// because a "use server" file may export only async functions.
import type { Region } from "@/lib/db/types";

export interface ClientFormValues {
  name: string;
  code: string;
  colour: string;
  region: Region;
  internal_target_days: number;
  retention_months: number;
  ai_enabled: boolean;
  /** Public form (slice 5). contact_email is "" for none. */
  form_enabled: boolean;
  contact_email: string;
}

export interface ClientFormState {
  values: ClientFormValues;
  /** Field name to message. "form" is for errors not tied to one field. */
  errors: Partial<Record<keyof ClientFormValues | "form", string>>;
}

export const DEFAULT_CLIENT: ClientFormValues = {
  name: "",
  code: "",
  colour: "#1d5c86",
  region: "england-and-wales",
  internal_target_days: 28,
  retention_months: 36,
  ai_enabled: true,
  form_enabled: true,
  contact_email: "",
};
