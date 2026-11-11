// One-time link tokens for the public form. The raw token goes in the email; only its hash is
// stored, so a copy of the database cannot be used to verify someone else's request.
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as URL-safe base64 (43 characters). */
export function makeToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Lower-case hex SHA-256, the form the database stores and checks (64 characters). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A token as it should look in a link; anything else is refused before the database is asked. */
export function looksLikeToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * The key that proves a form call comes from this server (FORM_SERVER_KEY). The database holds
 * its hash and refuses pd.form_submit, pd.form_verify and pd.form_set_triage without it, so
 * nobody can write a "verified" request with the publishable key alone. Never sent to a browser.
 */
export function formServerKey(): string | null {
  const key = process.env.FORM_SERVER_KEY;
  return key && key.length >= 32 ? key : null;
}
