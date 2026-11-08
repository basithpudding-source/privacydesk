# Next steps

Build order for the production app, in slices you can finish in one or two evenings each. Each slice ends with something you can click.

## 0. Before coding (this week)

- [ ] Declare the side business on the BBC Declaration of Personal Interests form; check the outside-work and IP clauses in your contract.
- [ ] Show the prototype (`prototype/index.html`, or the hosted copy) to 10 DPO consultancies. Three pilots by 22 November = build. Fewer = change the customer first.
- [x] Git repository initialised locally (8 November 2026). Still to do: push it to GitHub.

## 1. Project setup (1 evening)

- [ ] Create a Supabase project in the London region. Note the URL and anon key.
- [ ] Run `supabase/migrations/0001_initial.sql` in the SQL editor. Then run `supabase/schema_test.sql` and check every row says PASS.
- [x] In `apps/`, run `npx create-next-app@latest web --typescript --tailwind --app --src-dir --eslint`, then `npx shadcn@latest init`.
- [x] Add `@supabase/ssr` and `@supabase/supabase-js`. Still to do: put the keys in `apps/web/.env.local` (never commit it); see `apps/web/README.md`.
- [x] Copy `packages/clocks/clocks.js` into the app as a TypeScript module and port the tests to Vitest. Tests green before moving on.

## 2. Sign in and clients (1 to 2 evenings)

- [ ] Email magic-link sign-in with Supabase Auth; turn on MFA for partner admins.
- [ ] Partner and organisation pages: list clients, add a client (name, code, colour, region, retention months).
- [ ] Prove isolation: two test partners, each sees only its own clients.

## 3. Cases (2 to 3 evenings)

- [ ] Case list sorted by next deadline, with the three deadline states and filters (status, type, client, search).
- [ ] Case page as a task list (see DESIGN-STANDARD §3) with the deadline block and audit trail.
- [ ] Actions: acknowledge, ask for ID, ID received, ask for clarification, clarification received, extend, note, close, reopen. Each writes a `case_events` row.
- [ ] Keyboard: `C`, `/`, `G C`, `?` and the command palette.

## 4. Inbox and AI (2 evenings)

- [ ] Inbox view for new items; accept (creates case with the right clock) or decline.
- [ ] AI triage route handler: message in, JSON out (type, confidence, summary, quoted reasons). A person confirms. Keyword check as fallback.
- [ ] AI letter drafts for acknowledgement, ID request, clarification, extension, outcome. Copy only; nothing sent.
- [ ] Forwarding address per client with an inbound email service (Postmark or Resend inbound) that creates inbox items.

## 5. Public form and verification (1 to 2 evenings)

- [ ] Public form per client at `/r/<client code>` with the client's colour.
- [ ] Email magic-link verification before the request is accepted; confirmation page and email with reference and response date.
- [ ] Submissions land in the inbox, not directly in cases.

## 6. Dashboard, report, reminders (2 evenings)

- [ ] Dashboard from `pd.v_case_deadlines`; per-client table; monthly chart.
- [ ] Monthly report from `pd.v_monthly_client_report`, as a page and a PDF.
- [ ] Nightly job: reminder emails at 7 days, 2 days and on the day; bank holidays refreshed from the GOV.UK feed; retention job run.

## 7. Production security checklist (before any real data)

- [ ] MFA on; session timeout; rate limits on the public form.
- [ ] RLS tests pass against the live database; service key never in the browser.
- [ ] Backups on; restore tested once.
- [ ] Data processing agreement, terms, privacy notice and sub-processor list published.
- [ ] AI provider under a data processing agreement, no training on data, switchable off per client.
- [ ] Penetration-style check: try to read another partner's case by id; try to edit an audit event.

## How to work with Claude Code on this

Open this folder in Claude Code. For each slice, start with: "Read CLAUDE.md and docs/DESIGN-STANDARD.md, then build slice N from docs/NEXT-STEPS.md. Show me the plan before writing code." Review the plan, let it build, then test it yourself in the browser before committing. Keep commits small so you can read every diff.
