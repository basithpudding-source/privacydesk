// How one person likes the app to look and behave: theme, density, where the navigation and
// the case preview sit, how cases open, and which columns the case list shows. These are
// conveniences, not case data, so they live in a cookie in that person's browser: the server
// can read it to draw the page right first time, and nothing about it is stored in the
// database. Everything read from the cookie is checked against the lists below.

export const PREFS_COOKIE = "pd_prefs";

export const THEMES = ["system", "light", "dark"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const NAV_POSITIONS = ["top", "side"] as const;
export const PREVIEW_POSITIONS = ["right", "below"] as const;
export const OPEN_CASES = ["same", "new"] as const;

/** The case list's columns, in the order they appear. "ref" is always shown. */
export const CASE_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "deadline", label: "Next deadline" },
  { key: "from", label: "From" },
  { key: "subject", label: "Subject" },
  { key: "summary", label: "Summary" },
  { key: "client", label: "Client" },
  { key: "type", label: "Type" },
  { key: "channel", label: "Channel" },
  { key: "received", label: "Received" },
  { key: "target", label: "Target" },
  { key: "acknowledged", label: "Acknowledged" },
] as const;
export type CaseColumn = (typeof CASE_COLUMNS)[number]["key"];
export const DEFAULT_CASE_COLUMNS: CaseColumn[] = CASE_COLUMNS.map((c) => c.key);

/**
 * A saved list of visible columns (in the cookie, or in a saved view) from before a column
 * existed says nothing about that column, so it is shown rather than taken as hidden. Each
 * saved list carries the version it was saved under; one with no version is from version 1.
 * When adding a column: raise COLUMNS_VERSION and give the column that number here.
 */
export const COLUMNS_VERSION = 2;
const COLUMN_SINCE: Partial<Record<CaseColumn, number>> = { subject: 2 };

/** The version a saved list of columns was saved under; anything unreadable counts as the first. */
export function columnsVersionOf(raw: unknown): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

export interface Prefs {
  theme: (typeof THEMES)[number];
  density: (typeof DENSITIES)[number];
  nav: (typeof NAV_POSITIONS)[number];
  preview: (typeof PREVIEW_POSITIONS)[number];
  openCases: (typeof OPEN_CASES)[number];
  caseColumns: CaseColumn[];
}

export const DEFAULT_PREFS: Prefs = {
  // Light unless the person chooses otherwise: the app should not change its look on its own.
  theme: "light",
  density: "comfortable",
  nav: "top",
  preview: "right",
  openCases: "same",
  caseColumns: DEFAULT_CASE_COLUMNS,
};

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Keep only known column keys, in the table's own order, and add any column that did not
 * exist when the list was saved; an empty or broken list means all.
 */
export function cleanColumns(value: unknown, savedUnder: number): CaseColumn[] {
  if (!Array.isArray(value)) return DEFAULT_CASE_COLUMNS;
  const chosen = DEFAULT_CASE_COLUMNS.filter((k) => value.includes(k));
  if (!chosen.length) return DEFAULT_CASE_COLUMNS;
  return DEFAULT_CASE_COLUMNS.filter((k) => chosen.includes(k) || (COLUMN_SINCE[k] ?? 1) > savedUnder);
}

/** Read preferences from the cookie's text. Anything missing or unknown falls back to the default. */
export function parsePrefs(raw: string | undefined | null): Prefs {
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) o = parsed as Record<string, unknown>;
  } catch {
    o = {};
  }
  return {
    theme: oneOf(THEMES, o.theme, DEFAULT_PREFS.theme),
    density: oneOf(DENSITIES, o.density, DEFAULT_PREFS.density),
    nav: oneOf(NAV_POSITIONS, o.nav, DEFAULT_PREFS.nav),
    preview: oneOf(PREVIEW_POSITIONS, o.preview, DEFAULT_PREFS.preview),
    openCases: oneOf(OPEN_CASES, o.openCases, DEFAULT_PREFS.openCases),
    caseColumns: cleanColumns(o.caseColumns, columnsVersionOf(o.columnsVersion)),
  };
}

/** The cookie text for a set of preferences. */
export function serialisePrefs(p: Prefs): string {
  return encodeURIComponent(JSON.stringify({ ...p, columnsVersion: COLUMNS_VERSION }));
}

/** The class the <html> element wears for a theme. "system" follows the device setting in CSS. */
export function themeClass(theme: Prefs["theme"]): string {
  return theme === "dark" ? "dark" : theme === "system" ? "theme-system" : "";
}
