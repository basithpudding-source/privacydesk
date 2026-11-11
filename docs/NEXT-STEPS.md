# Next steps

Build order for the production app, in slices you can finish in one or two evenings each. Each slice ends with something you can click.

## 0. Before coding (this week)

- [ ] Declare the side business on the BBC Declaration of Personal Interests form; check the outside-work and IP clauses in your contract.
- [ ] Show the prototype (`prototype/index.html`, or the hosted copy) to 10 DPO consultancies. Three pilots by 22 November = build. Fewer = change the customer first.
- [x] Git repository initialised locally (8 November 2026). Still to do: push it to GitHub.

## 1. Project setup (1 evening)

- [x] Create a Supabase project in the London region (`privacy-desk-dev`, ref `cmhjmkzvfbbmndllxlpg`, 8 November 2026). Still to do: put the URL and publishable key in `apps/web/.env.local`.
- [x] Run the files in `supabase/migrations/` in order in the SQL editor, add `pd` to the exposed schemas, then run `supabase/schema_test.sql` and check every row says PASS. Done 8 November 2026: both migrations applied, every check PASS, test data removed afterwards. Step by step in `apps/web/README.md`.
- [x] In `apps/`, run `npx create-next-app@latest web --typescript --tailwind --app --src-dir --eslint`, then `npx shadcn@latest init`.
- [x] Add `@supabase/ssr` and `@supabase/supabase-js`. Still to do: put the keys in `apps/web/.env.local` (never commit it); see `apps/web/README.md`.
- [x] Copy `packages/clocks/clocks.js` into the app as a TypeScript module and port the tests to Vitest. Tests green before moving on.

## 2. Sign in and clients (1 to 2 evenings)

- [x] Email magic-link sign-in with Supabase Auth; turn on MFA for partner admins. (8 November 2026: sign-in, confirm route, session-refresh proxy, TOTP enrolment and challenge.)
- [x] Partner and organisation pages: list clients, add a client (name, code, colour, region, retention months). (Plus a welcome step that creates the consultancy via `pd.create_partner`.)
- [x] Prove isolation: two test partners, each sees only its own clients. SQL proof passes in `supabase/schema_test.sql`. Browser procedure in `apps/web/README.md` run on 8 November 2026 with two real sign-ins: partner B's list shows only its client, partner A's client URL returns 404 for B, and the Data API with B's session returns an empty list for A's client id.

## 3. Cases (2 to 3 evenings)

- [x] Case list sorted by next deadline, with the three deadline states and filters (status, type, client, search). (8 November 2026)
- [x] Case page as a task list (see DESIGN-STANDARD §3) with the deadline block and audit trail. The block also compares the TypeScript engine's date with the database view's and warns if they differ.
- [x] Actions: acknowledge, ask for ID, ID received, ask for clarification, clarification received, extend, note, close, reopen. Each writes a `case_events` row. (All nine go through `pd.record_case_action`, one transaction per action; walked through live against the ICO dates.)
- [x] Keyboard: `C`, `/`, `G C`, `?` and the command palette. (`G L` for clients too. `G I` waits for the inbox.)

## 4. Inbox and AI (2 evenings)

- [x] Inbox view for new items; accept (creates case with the right clock) or decline. (8 November 2026: `pd.inbox_items`, `pd.accept_inbox_item`, `pd.decline_inbox_item`; the accept event records what the AI proposed and what the person confirmed.)
- [x] AI triage route handler: message in, JSON out (type, confidence, summary, quoted reasons). A person confirms. Keyword check as fallback. (`POST /api/triage`; Claude Opus 5.5 with a fixed JSON schema; keyword fallback when the client has AI off, no key is set, or the call fails.)
- [x] AI letter drafts for acknowledgement, ID request, clarification, extension, outcome. Copy only; nothing sent. (`POST /api/letters` streams into a box on the case page; templates with gaps when AI is off.)
- [x] Forwarding address per client with an inbound email service (Postmark or Resend inbound) that creates inbox items. (`POST /api/inbound/postmark`, keyed by a per-client token; tested with sample payloads. Still to do: choose the domain, point its MX at Postmark, set `INBOUND_DOMAIN` and `INBOUND_WEBHOOK_SECRET`; see `apps/web/README.md`.)

## 5. Public form and verification (1 to 2 evenings)

- [x] Public form per client at `/r/<client code>` with the client's colour. (8 November 2026: four fields plus a honeypot; client codes made unique across consultancies so the address names one client.)
- [x] Email magic-link verification before the request is accepted; confirmation page and email with reference and response date. (One-time token, hashed in the database, 24 hours; reference `<code>-W0001`; the clock starts on the day the link is opened. Sender is Resend; with no key, development prints the emails to the server log and shows the link on the page. Still to do: a Resend account, `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL`.)
- [x] Submissions land in the inbox, not directly in cases. (Channel "Web form", triaged on arrival, with the reference and the requester's own choice of type shown; the accept form is prefilled from them.)

## 6. Dashboard, report, reminders (2 evenings)

- [x] Dashboard from `pd.v_case_deadlines`; per-client table; monthly chart. (8 November 2026: four tiles, the attention list, a six-month grouped bar chart with its table, and the per-client table; `G then D`.)
- [x] Monthly report from `pd.v_monthly_client_report`, as a page and a PDF. (The prototype's plain-English text with a copy button; `GET /api/report/pdf` renders it with @react-pdf/renderer; `G then R`.)
- [x] Nightly job: reminder emails at 7 days, 2 days and on the day; bank holidays refreshed from the GOV.UK feed; retention job run. (`/api/jobs/nightly` with `JOBS_SECRET`, the one place the service role is used; `pd.reminders_due` and `pd.reminder_log` in migration 0007. Database side proved live under the service role. Still to do: put `SUPABASE_SERVICE_ROLE_KEY` in the app's environment and schedule the call; see `apps/web/README.md`.)

## 7. Production security checklist (before any real data)

Built on 8 November 2026 (migration 0008). Ticked items are in code and proved live; the unticked parts are settings, contracts and purchases only you can do. The step-by-step list is in `apps/web/README.md` under "Production checklist".

- [x] MFA on; session timeout; rate limits on the public form. (The database refuses a partner admin without `aal2`; sessions idle for `SESSION_IDLE_HOURS` (8) are ended by the proxy; the form caps each email address at 5 and each sender address at 10 submissions an hour; security headers on every response.) Still to do by hand: Supabase Auth token lifetime and refresh rotation; the Pro-plan session limits.
- [x] RLS tests pass against the live database; service key never in the browser. (`supabase/live_checks.sql` runs against the real project and seeds nothing; a Vitest guard fails the build if the service key is read anywhere but `lib/supabase/service.ts` or imported anywhere but the nightly route.)
- [ ] Backups on; restore tested once. (Needs the Supabase Pro plan: the free plan keeps no backups. Then restore once into a scratch project.)
- [ ] Data processing agreement, terms, privacy notice and sub-processor list published. (Drafts are live at `/terms`, `/privacy`, `/dpa` and `/sub-processors` with a "draft" banner and placeholders in square brackets. A solicitor reviews them, you fill in the company details, then remove the banner in `src/components/legal-page.tsx`.)
- [ ] AI provider under a data processing agreement, no training on data, switchable off per client. (The per-client switch exists; `AI_DISABLED=1` switches it off for the whole deployment. Still to do: accept Anthropic's commercial terms and DPA, confirm the no-training default for API traffic, and record the date on the sub-processors page.)
- [x] Penetration-style check: try to read another partner's case by id; try to edit an audit event. (Both in `supabase/live_checks.sql`, with the anonymous-role and job-function checks. Ran clean on 8 November 2026.)
- [x] Reset the database password: it appeared in plain text in the terminal on 8 November 2026. Reset the same day; the app uses the API keys, so nothing else changed.

## 8. Review fixes (11 November 2026)

A code review found five gaps against the rules in `CLAUDE.md` and six smaller faults. The fixes are in migrations 0009 to 0017 and the app, tested against a local in-memory Postgres (every migration, `schema_test.sql` and `live_checks.sql`). They were applied to the Supabase project on 11 November 2026; the two server keys below are still to set.

Rule gaps:

- [x] The audited functions are the only way to change a case (0009).
- [x] The public form's database functions need the server's key (0010).
- [x] Letter drafts respect each client's AI switch.
- [x] Retention reaches the inbox and no longer fails on cases that came from it (0011).
- [x] Reminders survive a failed send or a missed night, and cover overdue cases (0012).

Smaller faults:

- [x] "Today" is the date in London, in the app and the database (0013).
- [x] References are numbered from a counter, so retention cannot bring one back (0014).
- [x] An extension cannot be recorded after the first month (0015).
- [x] A client cannot be deleted through the API (0016).
- [x] The emailed link opens a page with a button; pressing it sends the request. Opening the link alone does nothing.
- [x] `APP_URL` is required in production; without it the public form refuses submissions.
- [x] The inbound email functions need the server's key as well as the client's forwarding token (0017).

Still to do by hand:

- [x] Run `0009` to `0017` in order in the SQL editor on `privacy-desk-dev`. (Done 11 November 2026, as one query.)
- [ ] Generate a key (`openssl rand -hex 32`), put it in `apps/web/.env.local` as `FORM_SERVER_KEY`, and run `select pd.set_server_key('public_form', '<the same value>');` in the SQL editor. Until then the public form refuses submissions.
- [ ] Do the same with a second key for inbound email: `INBOUND_SERVER_KEY` in `apps/web/.env.local`, and `select pd.set_server_key('inbound_email', '<the same value>');`. Until then the inbound webhook refuses mail.
- [x] Run `supabase/live_checks.sql` and check every row says PASS. (Done 11 November 2026: all 21 rows PASS.)
- [ ] Click through once: log a case and act on it, try to extend an old case late, paste a message into the inbox and accept it, submit the public form, open the link and press the button, draft a letter for a client with AI off. The confirmation page with the button has not been seen in a browser yet.

## How to work with Claude Code on this

Open this folder in Claude Code. For each slice, start with: "Read CLAUDE.md and docs/DESIGN-STANDARD.md, then build slice N from docs/NEXT-STEPS.md. Show me the plan before writing code." Review the plan, let it build, then test it yourself in the browser before committing. Keep commits small so you can read every diff.
