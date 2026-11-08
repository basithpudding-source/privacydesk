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
