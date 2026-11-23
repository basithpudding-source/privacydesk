// Runs the database's migrations and tests in an in-memory Postgres (PGlite): nothing is
// installed, and no real database is touched.
//
//   node supabase/local/run.mjs               every migration in order, then the schema tests
//                                             and the live checks
//   node supabase/local/run.mjs a.sql b.sql   just those files, in that order
//
// It prints each query's rows and stops at the first error. The tests raise an error when a
// rule is broken, so "All passed" at the end means every one of them held. Lines that start
// with FAIL also fail the run.
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const supabase = join(here, "..");
const migrations = readdirSync(join(supabase, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => join(supabase, "migrations", f));
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : [join(here, "bootstrap.sql"), ...migrations, join(supabase, "schema_test.sql"), join(here, "reset.sql"), join(supabase, "live_checks.sql")];

const db = new PGlite();
let passed = 0;
let failed = 0;

for (const file of files) {
  // psql's own commands (a line starting with a backslash) mean nothing here.
  const sql = readFileSync(file, "utf8").split(/\r?\n/).filter((line) => !line.startsWith("\\")).join("\n");
  try {
    const results = await db.exec(sql, { onNotice: (n) => console.log(`NOTICE ${n.message}`) });
    for (const result of results) {
      for (const row of result.rows ?? []) {
        const line = Object.values(row).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))).join(" | ");
        if (/^PASS\b/.test(line) || / PASS$/.test(line)) passed += 1;
        if (/\bFAIL\b/.test(line)) failed += 1;
        console.log(line);
      }
    }
  } catch (e) {
    console.log(`ERROR in ${basename(file)}: ${e.message}`);
    process.exit(1);
  }
}

if (failed > 0) {
  console.log(`\n${failed} line(s) say FAIL.`);
  process.exit(1);
}
console.log(`\nAll passed: ${files.length} file(s) ran without an error; ${passed} line(s) say PASS.`);
