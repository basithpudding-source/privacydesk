// Guards that fail the test run if a secret could reach the browser (production checklist).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const APP = join(SRC, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("guards.test.ts"));
const rel = (f: string) => relative(SRC, f).replace(/\\/g, "/");
const read = (f: string) => readFileSync(f, "utf8");

describe("the service role stays on the server", () => {
  it("is read in one file only", () => {
    const users = files.filter((f) => read(f).includes("SUPABASE_SERVICE_ROLE_KEY")).map(rel);
    expect(users).toEqual(["lib/supabase/service.ts"]);
  });

  it("is imported by the nightly job route only", () => {
    const importers = files.filter((f) => /from\s+["'](@\/lib\/supabase\/service|\.\.?\/.*supabase\/service|\.\/service)["']/.test(read(f))).map(rel);
    expect(importers).toEqual(["app/api/jobs/nightly/route.ts"]);
  });

  it("is never referenced from a client component", () => {
    const clientFiles = files.filter((f) => /^\s*["']use client["']/m.test(read(f)));
    for (const f of clientFiles) {
      expect(read(f), rel(f)).not.toMatch(/service_role|SERVICE_ROLE|createServiceClient/);
    }
  });
});

describe("public environment variables carry no secrets", () => {
  it("no NEXT_PUBLIC_ name looks like a secret, in code or in the example env file", () => {
    const sources = [...files.map(read), readFileSync(join(APP, ".env.local.example"), "utf8")];
    for (const s of sources) {
      const names = s.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const n of names) expect(n).not.toMatch(/SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN/);
    }
  });

  it("server-only secrets are not read from client components", () => {
    const clientFiles = files.filter((f) => /^\s*["']use client["']/m.test(read(f)));
    for (const f of clientFiles) {
      expect(read(f), rel(f)).not.toMatch(/ANTHROPIC_API_KEY|RESEND_API_KEY|JOBS_SECRET|INBOUND_WEBHOOK_SECRET|FORM_SERVER_KEY/);
    }
  });
});
