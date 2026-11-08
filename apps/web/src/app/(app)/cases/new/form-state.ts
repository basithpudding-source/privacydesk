export interface NewCaseValues {
  organisation_id: string;
  type: string;
  channel: string;
  received_on: string;
  requester_name: string;
  requester_email: string;
  summary: string;
  message: string;
  id_required: boolean;
}

export interface NewCaseState {
  values: NewCaseValues;
  errors: Partial<Record<keyof NewCaseValues | "form", string>>;
}

export function defaultNewCase(organisationId: string, today: string): NewCaseValues {
  return {
    organisation_id: organisationId,
    type: "sar",
    channel: "Email",
    received_on: today,
    requester_name: "",
    requester_email: "",
    summary: "",
    message: "",
    id_required: false,
  };
}
