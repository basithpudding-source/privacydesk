// The idle rule for signed-in sessions. Pure, so it is tested without a request.

export const LAST_ACTIVE_COOKIE = "pd_last_active";
export const DEFAULT_IDLE_HOURS = 8;

/** Hours of inactivity before a session is ended: SESSION_IDLE_HOURS, else 8. */
export function idleHours(): number {
  const n = Number(process.env.SESSION_IDLE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_HOURS;
}

/**
 * True when the last activity was longer ago than the limit. A missing or unreadable
 * timestamp is not idle: it is the first request of a session, and the cookie is set then.
 */
export function isIdle(lastActiveMs: number | null | undefined, nowMs: number, hours: number): boolean {
  if (!lastActiveMs || !Number.isFinite(lastActiveMs)) return false;
  return nowMs - lastActiveMs > hours * 60 * 60 * 1000;
}
