# Privacy Desk

A hosted case desk for small UK data protection consultancies: complaints and subject access requests (SARs) for many client organisations in one place, with legal deadline clocks, AI triage of incoming messages and a monthly client report.

Read `docs/DESIGN-STANDARD.md` before building any screen and `docs/NEXT-STEPS.md` for the build order.

## Layout

- `packages/clocks/` — the deadline engine (`clocks.js`) and its tests. The single source of truth for dates in the browser. Run `node clocks.test.js` after any change; all tests must pass.
- `supabase/migrations/` — the Postgres schema. The same deadline rules live here as SQL functions and views, with row-level security per client. `supabase/schema_test.sql` tests it.
- `prototype/` — the first clickable version (one HTML file) and its sample data. Reference only; do not extend it.
- `apps/web/` — the production Next.js app (to be created).
- `docs/` — design standard, build order, decisions.

## Rules that never change

- Deadlines follow ICO guidance exactly. Never change a date rule without adding a test built from the ICO's worked examples.
- AI classifies, summarises and drafts. A person confirms every triage result and sends every letter. The app never sends email on its own.
- Every change to a case writes an audit event. Audit events are never edited or deleted on their own.
- One client organisation must never see another's data. Enforce this with row-level security in the database, not only in app code.
- Sample data only until the production security checklist in `docs/NEXT-STEPS.md` is complete. Never put real personal data in a dev environment.
- Software, not legal advice: say so in the UI and the terms.

## Conventions

- TypeScript, Next.js App Router, Tailwind, shadcn/ui components, Supabase (Postgres, Auth, RLS).
- UK English in all copy. Dates shown as "Monday 23 November 2026" on case pages and "23 Nov 2026" in tables.
- Keep the working directory clean: small commits, one change each, with a message that says why.
- When unsure about a product decision, add it to `docs/DECISIONS.md` as an open question rather than guessing.
