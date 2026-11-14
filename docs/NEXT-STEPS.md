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
- [ ] Keep "Confirm email" switched on in Supabase Auth, and do not enable sign-up with a password without it. From migration 0022 a person joins a team by signing in with the address an administrator named, so an address must be proved before it counts.

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
- [x] Generate a key (`openssl rand -hex 32`), put it in `apps/web/.env.local` as `FORM_SERVER_KEY`, and run `select pd.set_server_key('public_form', '<the same value>');` in the SQL editor. Done 12 November 2026: a sample request went through the form, the link, the button and into the inbox.
- [x] Do the same with a second key for inbound email: `INBOUND_SERVER_KEY` in `apps/web/.env.local`, and `select pd.set_server_key('inbound_email', '<the same value>');`. Registered 12 November 2026.
- [x] Run `supabase/live_checks.sql` and check every row says PASS. (Done 11 November 2026: all 21 rows PASS.)
- [x] Click through once. Done 12 November 2026 with sample data: logged cases in each deadline state, a late extension was refused, inbox items were accepted and declined, the public form went through the link and the button, and a sample email reached the inbox through the webhook (a wrong secret was refused and a repeat delivery ignored). Not tried: a letter draft, the PDF report, and the nightly job.

## 9. Sorting and email import (12 November 2026)

- [x] Column headings sort the cases table and the dashboard's by-client table.
- [x] Import several saved emails into the inbox at once (`/inbox/import`), keeping each email's own date and id.
- [x] Run `supabase/migrations/0018_import_emails.sql` in the SQL editor on `privacy-desk-dev`. Done 12 November 2026; two sample `.eml` files were imported, a repeat was refused, and the accept form started from the email's own date.
- [ ] Try the import with real `.msg` files dragged from classic Outlook; only `.eml` files have been tested.

## 10. Profile, preferences, views and undo (12 November 2026)

- [x] Profile page: who is signed in, role, consultancy, second factor, a display name, and look-and-layout preferences (theme, density, navigation position, preview position, how cases open).
- [x] Cases: ready-made views, saved views, a column picker, and opening a case in a new window.
- [x] Undo: put a declined message back in the inbox; return a case to the inbox; an inbox log of every decision.
- [x] Run `supabase/migrations/0019_saved_views_and_undo.sql` in the SQL editor on `privacy-desk-dev`. Done 12 November 2026. Supabase warned that a table was created without row-level security; that was a false alarm, checked on the live database: both new tables have it on, the inbox log cannot be written by users, and all 22 live checks pass.
- [x] After 0019, tested with sample data: a view was saved, applied (filters and hidden column restored), updated, renamed and deleted; a declined message was put back in the inbox; a case was returned to the inbox, closed and marked, with both steps on the message's log and the dashboard counts adjusted (one fewer open case, on-time figure unchanged).
- [x] Run `supabase/migrations/0020_return_event_wording.sql`. Done 12 November 2026; checked on the live database that the function carries the new wording, still runs with definer rights, can be run by signed-in users and not by anonymous ones. It was not exercised by returning another case, so the first new entry is the first time the wording shows in the app.

## 11. Letters as ready replies (12 November 2026)

- [x] Drafts are signed with the sender's name and job title from their profile.
- [x] Each draft has a recipient, a subject with the case reference, and the person's original message quoted underneath.
- [x] Gaps, dates that are not the case's, a near-miss reference and a guessed title are highlighted, with a "Before you send" list.
- [x] "Open in my email program" hands the draft to the person's own email program; the app still sends nothing.
- [ ] Add your name and job title on the profile page, so drafts are signed with them.
- [ ] Press "Open in my email program" on a sample case and check what arrives in Outlook. The link was checked in the browser (recipient, subject, text, original message, line breaks, length), but it was intercepted there and never handed to a real email program.

## 12. Sent email as evidence for a step (12 November 2026)

- [x] Drop or choose a sent email (.eml or Outlook .msg) on a step that sends one: the date is taken from it and a short record is kept with the step.
- [x] The record says whether it went to the address on the case, and names any attachments; the email itself is not stored.
- [x] A note typed when asking for proof of identity is now recorded (it was being dropped).
- [x] Run `supabase/migrations/0021_email_evidence.sql` in the SQL editor on `privacy-desk-dev`. Done 12 November 2026; checked on the live database that there is one version of the function, with the new sixth parameter, that it still runs with definer rights, and that signed-in users can run it and anonymous ones cannot. All 22 live checks pass.
- [x] After 0021, tested with sample data on case 158949-003: a sample sent email was dropped on "Mark acknowledged"; the date was set to the day it was sent (11 Nov 2026), and the audit entry reads "Acknowledgement sent on 11 Nov 2026." with the short record underneath (when, to the address on the case, subject, attachment name, a one-sentence AI summary). A plain note with no email was then added to the same case and recorded as before.
- [ ] Not yet tried on the live database: the other four steps that take an email (ask for proof of identity, ask for clarification, extension, close). They pass in the schema tests, and the screens were checked before 0021, but no such step has been recorded there with an email.
- [ ] Try it with real `.msg` files dragged from Outlook's Sent folder; only `.eml` files have been tested.

## 13. Case page layout and discarding drafts (12 November 2026)

- [x] The details and the request as received are in the top pane, under the due date. The column beside the page holds only the box for recording a step or a note, and the audit trail.
- [x] That row starts closed, showing only the headings "Details" and "The request as received" with arrows; either heading opens or closes it, by mouse or keyboard. Checked in the signed-in app.
- [x] A letter draft can be stopped while it is being written ("Stop and discard") or cleared afterwards ("Discard draft"); the last discarded draft can be put back. Stopping also ends the request to the AI provider (checked in the dev server).
- [x] Checked with sample data in the signed-in app, dark and light: a subject access request and a complaint, with the action box open; a draft stopped part way, then written, edited, discarded and put back with the edit intact.
- [ ] Not seen with real examples, only imitated on the page: a case with no message (the details take the full width), a request longer than eight lines ("Show all of it"), and a narrow window or phone (the pane was narrowed, the window was not).

## 14. Subject line of the incoming message (13 November 2026)

- [x] On a case, "The request as received" shows the subject line above the message, with a button to copy it. The preview beside the cases table shows it too.
- [x] The cases table has a Subject column, between From and Summary. It sorts, can be hidden from the Columns menu, and the search box finds cases by it.
- [x] Checked with sample data in the signed-in app: cases made from emails and from the web form show their subject; cases logged by hand show none; sorting, searching and copying work; the column appeared without having to tick it.
- [ ] Not seen: an email that arrived with no subject line (the case page should say so), and a saved view from before this column (it should gain the column when applied). Both are covered by tests, not by a real example.

## 15. An organisation's own desk, and a team with access rights (13 November 2026)

- [x] Database (migration 0022): a desk is a consultancy or an organisation's own; an organisation's desk is made with its one organisation; colleagues are added by email address at three levels of access and join when they sign in; every change to a team is written to a log that cannot be edited; a second factor is required of everyone who sees the whole desk. Tested in the local database with every other migration, including that the rules fail when deliberately weakened.
- [x] App: the first screen after signing in asks who the desk is for, or offers to join the team the person has been added to. A Team and access page (administrators only) adds people, changes access, removes people and shows the log. In an organisation's desk nothing says client, and the fifth section is the organisation's settings.
- [x] Checked in the signed-in app before the migration: the consultancy desk works as before on every page, and the Team page says it is waiting for the migration. The organisation version was checked by switching the working copy to it for a few minutes (then switching back): no page mentions clients, the Client column, filter, picker and board are gone, and the case form does not ask whose case it is.
- [x] Run `supabase/migrations/0022_workspace_kinds_and_team.sql` in the SQL editor on `privacy-desk-dev`. Done 13 November 2026. Checked on the live database: both existing desks are consultancies and every member has their address; row-level security is on for members, invitations and the team log; signed-in users cannot write to any of the three; the new functions run with definer rights for signed-in users only, and the address lookup cannot be called at all. All 25 live checks pass.
- [x] After 0022, on the Team page of the signed-in app: a made-up address was added as a case handler (it showed as waiting, tidied to lower case, with a log entry and the note that no email is sent); adding it a second time was refused in plain words; it was then withdrawn, with a second log entry. Cases, the inbox, the dashboard and the report still load. The two log entries are permanent, as the log is meant to be.
- [ ] Tidy in the next migration: `pd.role_words` (which only turns a level of access into words such as "a case handler") can be called without signing in. It reads no data, but every other function is closed to anonymous callers.
- [ ] After 0022, with a second email address of your own: sign in with it and set up an organisation's own desk; then from that desk add a third address, sign in with it and join. This is the only way to see joining and a real organisation desk, and it needs sign-in links only you can open.
- [ ] Review the terms, privacy notice and data processing terms for an organisation that buys the app for its own team (see the open question in DECISIONS.md).

## 16. Mailbox connection: choose emails to import, and reply from a case (14 November 2026)

- [x] Import page: "From my mailbox" lists the connected inbox for a period (last 24 hours, 7 days, 30 days, or between dates); ticked emails go into the import list as if their files had been dropped.
- [x] Case page: "Send from my mailbox" under a draft sends it from the person's own mailbox after an "are you sure" step, or saves it to Drafts to finish in Outlook; the step is recorded on the audit trail once it has gone.
- [x] The mailbox is connected in the browser only; the server never holds leave to use it. A sample mailbox of made-up emails stands in during development.
- [x] Checked in the signed-in app with the sample mailbox: listing by period, ticking and adding to the import list (not imported), the send panel, the gaps check, the "are you sure" step, saving to Drafts, checking whether it was sent, and remembering the draft across a reload. 20 tests cover the requests to Microsoft against a stand-in.
- [ ] Not tried: pressing "Send it now" (it writes a permanent entry on a case, even from the sample mailbox), and anything against a real Microsoft mailbox.
- [ ] Set up Microsoft, once. No password or secret is involved:
  1. Sign in at https://entra.microsoft.com with a Microsoft account that can register apps (a free Azure account gives you one; if it says you have no directory, create the free account first at https://portal.azure.com).
  2. Go to Applications, then App registrations, then New registration.
  3. Name: `Privacy Desk (dev)`. Supported account types: the option that includes any organisational directory and personal Microsoft accounts.
  4. Redirect URI: choose the platform "Single-page application (SPA)" and enter `http://localhost:3000/mailbox-redirect`. Press Register.
  5. On the overview page copy the "Application (client) ID" and put it in `apps/web/.env.local` as `NEXT_PUBLIC_MS_CLIENT_ID=<the id>`. It is not a secret. Do not create a client secret.
  6. Reload the app. The buttons now say "Connect my mailbox" and open Microsoft's own window.
- [ ] Test with a mailbox that holds only made-up emails (for example a new Outlook.com address), never your real one: real personal data must not go into the dev database, and a test reply is a real email.
- [ ] Before real use: add the live site's `https://…/mailbox-redirect` to the registration, verify the publisher with Microsoft, and tell organisations their IT administrator may need to approve the app.

## How to work with Claude Code on this

Open this folder in Claude Code. For each slice, start with: "Read CLAUDE.md and docs/DESIGN-STANDARD.md, then build slice N from docs/NEXT-STEPS.md. Show me the plan before writing code." Review the plan, let it build, then test it yourself in the browser before committing. Keep commits small so you can read every diff.
