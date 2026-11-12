import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { parsePrefs, PREFS_COOKIE, type Prefs } from "./prefs";

/** This person's preferences, read from their cookie. Cached per request. */
export const getPrefs = cache(async (): Promise<Prefs> => {
  const store = await cookies();
  return parsePrefs(store.get(PREFS_COOKIE)?.value);
});
