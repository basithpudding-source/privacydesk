// Words and tag colours for cases. Tags only ever show a status; colour is read as meaning.
import type { CaseType } from "@/lib/clocks";

export const CASE_TYPES: { value: CaseType; label: string; short: string }[] = [
  { value: "complaint", label: "Complaint", short: "Complaint" },
  { value: "sar", label: "Subject access request", short: "SAR" },
  { value: "erasure", label: "Erasure request", short: "Erasure" },
  { value: "rectification", label: "Rectification request", short: "Rectification" },
  { value: "objection", label: "Objection", short: "Objection" },
];

export function typeLabel(type: string, form: "label" | "short" = "label") {
  return CASE_TYPES.find((t) => t.value === type)?.[form] ?? type;
}

export const CHANNELS = ["Email", "Letter", "Phone", "Web form", "In person"];

/** Clock states from pd.v_case_deadlines. */
export type ClockState =
  | "awaiting_ack"
  | "acknowledged"
  | "waiting_id"
  | "paused"
  | "extended"
  | "running"
  | "closed";

/** Three visual deadline states from the design standard, plus grey for stopped clocks. */
export type Urgency = "fine" | "warning" | "overdue" | "stopped" | "none";

export function urgencyFor(state: ClockState, daysLeft: number | null): Urgency {
  if (state === "closed" || state === "acknowledged") return "none";
  if (state === "waiting_id" || state === "paused") return "stopped";
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 5) return "warning";
  return "fine";
}

/** Sentence-case adjectives, never verbs, so a tag is not mistaken for a button. */
export function clockLabel(state: ClockState, daysLeft: number | null): string {
  switch (state) {
    case "closed":
      return "Closed";
    case "acknowledged":
      return "Acknowledged";
    case "waiting_id":
      return "Waiting for ID";
    case "paused":
      return "Clock stopped";
    case "extended":
    case "running":
    case "awaiting_ack":
      if (daysLeft === null) return state === "extended" ? "Extended" : "Open";
      if (daysLeft < 0) return daysLeft === -1 ? "1 day overdue" : `${-daysLeft} days overdue`;
      if (daysLeft === 0) return "Due today";
      if (daysLeft === 1) return "Due tomorrow";
      return `${daysLeft} days left`;
  }
}

export const URGENCY_CLASSES: Record<Urgency, string> = {
  fine: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  overdue: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  stopped: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};
