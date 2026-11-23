# Privacy Desk

A hosted case desk for UK data protection work: complaints and subject access requests (SARs) in one place, with legal deadline clocks, AI triage of incoming messages and a monthly report.

A desk is one of two kinds, chosen when it is set up. A consultancy handles cases for many client organisations. An organisation's own team handles the organisation's cases, and nothing on its screens is called a "client". The wording that differs is in `apps/web/src/lib/desk.ts`; ask that file rather than writing "client" into a shared screen. Each desk has a team with three levels of access (administrator, case handler, read only).

Read `docs/DESIGN-STANDARD.md` before building any screen and `docs/NEXT-STEPS.md` for the build order.

## Layout

- `packages/clocks/` — the deadline engine (`clocks.js`) and its tests. The single source of truth for dates in the browser. Run `node clocks.test.js` after any change; all tests must pass.
- `supabase/migrations/` — the Postgres schema. The same deadline rules live here as SQL functions and views, with row-level security per client. `supabase/schema_test.sql` tests it: run `node supabase/local/run.mjs` after any change to a migration (it applies every migration to an in-memory Postgres and runs the tests; all must pass).
- `prototype/` — the first clickable version (one HTML file) and its sample data. Reference only; do not extend it.
- `apps/web/` — the production Next.js app (to be created).
- `docs/` — design standard, build order, decisions.

## Rules that never change

- Deadlines follow ICO guidance exactly. Never change a date rule without adding a test built from the ICO's worked examples.
- AI classifies, summarises and drafts. A person confirms every triage result and sends every letter. A letter goes only when a person presses Send: in their own email program, or from Privacy Desk through their own connected mailbox after a second "are you sure" step. The app never sends a letter on its own, on a timer, or because AI decided to. (Reworded 14 November 2026, when sending from a connected mailbox was added.)
- A person's mailbox is connected in their browser only (`apps/web/src/lib/mailbox`). Leave to use it is never sent to, or kept on, the server; the server sees only the emails a person chooses to import and the short record of what was sent.
- Every change to a case writes an audit event. Audit events are never edited or deleted on their own.
- One client organisation must never see another's data, and one desk must never see another's. Enforce this with row-level security in the database, not only in app code.
- Who is in a team, and what each person may do, changes only through the database functions that write the team log. Team log entries are never edited or deleted.
- Sample data only until the production security checklist in `docs/NEXT-STEPS.md` is complete. Never put real personal data in a dev environment.
- Software, not legal advice: say so in the UI and the terms.

## Conventions

- TypeScript, Next.js App Router, Tailwind, shadcn/ui components, Supabase (Postgres, Auth, RLS).
- UK English in all copy. Dates shown as "Monday 23 November 2026" on case pages and "23 Nov 2026" in tables.
- Keep the working directory clean: small commits, one change each, with a message that says why.
- When unsure about a product decision, add it to `docs/DECISIONS.md` as an open question rather than guessing.
