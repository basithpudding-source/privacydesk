// A "view" of the case list: a named set of filters, a sort and (for saved ones) the visible
// columns. Built-in views come with the app; saved views belong to one person and are kept
// in pd.saved_views. Whatever is stored is checked again here before it is used.
import { cleanColumns, type CaseColumn } from "@/lib/prefs";

export interface ViewParams {
  status?: string;
  type?: string;
  client?: string;
  q?: string;
  show?: string;
  sort?: string;
  dir?: string;
  /** Saved views remember which columns were showing; built-in ones leave columns alone. */
  columns?: CaseColumn[];
}

export interface CaseView {
  id: string;
  name: string;
  params: ViewParams;
  builtIn: boolean;
}

const KEYS = ["status", "type", "client", "q", "show", "sort", "dir"] as const;

export const BUILT_IN_VIEWS: CaseView[] = [
  { id: "open", name: "All open cases", params: {}, builtIn: true },
  { id: "overdue", name: "Overdue", params: { status: "overdue" }, builtIn: true },
  { id: "today", name: "Due today", params: { show: "today" }, builtIn: true },
  { id: "soon", name: "Due in 1 to 5 days", params: { show: "soon" }, builtIn: true },
  { id: "week", name: "Due in the next 7 days", params: { status: "week" }, builtIn: true },
  { id: "notRunning", name: "Clock not running", params: { show: "notRunning" }, builtIn: true },
  { id: "sars", name: "Open subject access requests", params: { type: "sar" }, builtIn: true },
  { id: "complaints", name: "Open complaints", params: { type: "complaint" }, builtIn: true },
  { id: "newest", name: "Newest first", params: { sort: "received", dir: "desc" }, builtIn: true },
  { id: "closed", name: "Closed cases", params: { status: "closed" }, builtIn: true },
  { id: "all", name: "Everything, open and closed", params: { status: "all" }, builtIn: true },
];

/** Keep only the known keys, as short strings; the case list validates each value again. */
export function cleanViewParams(raw: unknown): ViewParams {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: ViewParams = {};
  for (const k of KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim() && v.length <= 200) out[k] = v.trim();
  }
  if (out.status === "open") delete out.status;
  if (out.dir !== "desc" || !out.sort) delete out.dir;
  if (Array.isArray(o.columns)) out.columns = cleanColumns(o.columns);
  return out;
}

/** The case list's address for a view. Keys are in a fixed order so two equal views match. */
export function viewHref(params: ViewParams): string {
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const v = params[k];
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `/cases?${s}` : "/cases";
}

/** Whether two views filter and sort the same way (columns aside). */
export function sameFilters(a: ViewParams, b: ViewParams): boolean {
  return viewHref(cleanViewParams(a)) === viewHref(cleanViewParams(b));
}

export const MAX_SAVED_VIEWS = 30;
