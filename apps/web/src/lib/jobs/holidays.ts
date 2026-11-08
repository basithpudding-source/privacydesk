// Bank holidays from GOV.UK (https://www.gov.uk/bank-holidays.json): the three divisions
// match pd.bank_holidays.region exactly. The feed covers several years each way.
import type { Region } from "@/lib/clocks";

export interface HolidayRow {
  region: Region;
  day: string;
  name: string;
}

interface GovUkFeed {
  [division: string]: { division: string; events: { title: string; date: string }[] };
}

export const GOVUK_BANK_HOLIDAYS = "https://www.gov.uk/bank-holidays.json";
const REGIONS: Region[] = ["england-and-wales", "scotland", "northern-ireland"];

/** Rows for pd.bank_holidays from the feed's JSON. Unknown divisions and bad dates are skipped. */
export function parseGovUkHolidays(feed: unknown): HolidayRow[] {
  const f = feed as GovUkFeed;
  const rows: HolidayRow[] = [];
  for (const region of REGIONS) {
    for (const e of f?.[region]?.events ?? []) {
      if (typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.title === "string") {
        rows.push({ region, day: e.date, name: e.title.replace(/’/g, "'").slice(0, 80) });
      }
    }
  }
  return rows;
}

export async function fetchGovUkHolidays(): Promise<HolidayRow[]> {
  const res = await fetch(GOVUK_BANK_HOLIDAYS, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`GOV.UK bank holidays returned ${res.status}`);
  return parseGovUkHolidays(await res.json());
}
