"use client";

import { PREFS_COOKIE, serialisePrefs, themeClass, type Prefs } from "./prefs";

/**
 * Save preferences in this browser for a year and apply the theme at once. The caller then
 * refreshes the route so the server redraws with the new choices.
 */
export function savePrefs(p: Prefs) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFS_COOKIE}=${serialisePrefs(p)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  const root = document.documentElement;
  root.classList.remove("dark", "theme-system");
  const cls = themeClass(p.theme);
  if (cls) root.classList.add(cls);
}
