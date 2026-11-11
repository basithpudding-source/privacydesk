// "Today" for a UK case desk is the date in London, not the server's date. Servers run on UTC,
// which is an hour behind during British Summer Time: between midnight and 1am a UTC "today"
// is still yesterday, and a received date or a days-left count would be a day out.
// The database does the same in pd.today() (migration 0013).
import type { ISODate } from "@/lib/clocks";

const LONDON = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar date in London at a moment in time (a Date, or a timestamp string from the database). */
export function londonDate(at: Date | string): ISODate {
  const parts = LONDON.formatToParts(typeof at === "string" ? new Date(at) : at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Today's date in London. */
export function todayInLondon(): ISODate {
  return londonDate(new Date());
}
