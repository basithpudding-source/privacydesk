# Privacy Desk web app

The production Next.js app. Read the root `CLAUDE.md` and `docs/DESIGN-STANDARD.md` before building any screen.

## First-time setup

Allow about half an hour. You need a Supabase account and Node 24. Nothing here puts real personal data anywhere: the schema test uses made-up partners and cases.

### 1. Create the Supabase project

1. Go to supabase.com/dashboard and sign in.
2. Choose **New project**. Pick your organisation, give the project a name such as `privacy-desk-dev`, and set **Region** to **West EU (London)**. The region cannot be changed later, and UK data should stay in the UK.
3. Supabase generates a **database password**. Save it in your password manager now; you only need it for `psql` (step 4, option B) and it is not shown again.
4. Wait a minute or two for the project to finish provisioning.

The project reference is the string in the dashboard URL, for example `cmhjmkzvfbbmndllxlpg` in `supabase.com/dashboard/project/cmhjmkzvfbbmndllxlpg`. Your project URL is `https://<project ref>.supabase.co`.

### 2. Run the schema

The schema lives in `supabase/migrations/`. Run each file once, in order, in the SQL editor.

1. In the dashboard sidebar choose **SQL Editor**, then **New query**.
2. Open `supabase/migrations/0001_initial.sql` on your machine, copy the whole file, paste it into the editor and press **Run** (or Ctrl+Enter).
3. You should see **Success. No rows returned**. It creates a schema called `pd` with the tables, the deadline functions, the two views and the row-level security policies.
4. Repeat with `supabase/migrations/0002_api_access.sql`. This grants the signed-in role access to `pd`; without it the app cannot see the schema at all.

If a run fails halfway, the editor rolls the whole file back, so fix the cause and run it again from the top.

### 3. Expose the `pd` schema to the API

Supabase only serves the `public` schema through its API by default. The app uses `pd`.

1. In the sidebar choose **Integrations**, then **Data API**, then the **Settings** tab.
2. Under **Exposed schemas**, tick `pd` and save.

Skip this and every query from the app returns an error about the schema not being found, even though the tables exist.

The same page shows the `pd` tables with a warning that they "have custom grants". That is correct and deliberate: migration 0002 grants the signed-in role only, while Supabase's standard grants would also open the tables to the anonymous role. Do not select the tables there, or the standard grants replace ours.

### 4. Run the schema test

`supabase/schema_test.sql` checks the ICO worked examples against the database functions, proves the audit trail cannot be edited, and proves one partner cannot see another's cases. Run it **once on the fresh database**; it inserts fixed test rows, so a second run fails on duplicate keys (see "Resetting the test data" below).

Two things about the file to know first:

- Line 2, `\set ON_ERROR_STOP on`, is a `psql` command. The SQL editor rejects it, so delete that line before pasting if you use option A.
- Several checks report with `raise notice 'PASS ...'`. The SQL editor hides notices and shows only the **last** result of a run, which is why option B gives a fuller picture.

**Option A: SQL editor, in three runs.** Paste and run these parts of the file separately, in order.

1. From the top down to and including the big `select e.ref, ...` query (the one ending `order by e.ref;`). The result is a nine-row table, `T-1` to `T-9`, with a `result` column. **Every row must say PASS.** The other columns show the computed and expected dates so you can see which rule a row covers.
2. From the `do $$ begin if exists ...` block through the line `select case when not exists ... 'PASS retention removed events' ...`. The result is one row reading **PASS retention removed events**. If the audit-trail check had failed, the run would have stopped with an error saying `UPDATE was allowed` or `DELETE was allowed`.
3. The rest of the file, from `-- Client separation` to the end. The run must finish without an error; the last result is the first few rows of the monthly report view. To see the row counts, run the three `select 'partner A admin sees ...'` lines one at a time (each with its `set_config` line just above it): they should say 8, 1 and 1. If you get `permission denied to set role`, run `grant app_user to postgres;` and try again.

**Option B: psql, one command.** Shows every result and every notice. `psql` is not installed on Windows by default. This installs only the command-line tools, not a database server (it asks for admin approval; open a new terminal afterwards so `psql` is on the path):

    winget install --id PostgreSQL.PostgreSQL.17 --override "--mode unattended --unattendedmodeui none --enable-components commandlinetools --disable-components server,pgAdmin,stackbuilder"

Then, from the repo root, with `<project ref>` and `<database password>` replaced by your own values (keep the quotes; if the password contains `@`, `:`, `/` or `#`, percent-encode those characters):

    psql "postgresql://postgres.<project ref>:<database password>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" -f supabase/schema_test.sql

The exact connection string is under **Connect** at the top of the dashboard (choose **Session pooler**); it already has the ref filled in and `[YOUR-PASSWORD]` where the password goes. Expected output: the nine-row table with PASS in every row, then `NOTICE: PASS audit trail cannot be edited or deleted on its own`, `retention deleted 1 case(s)`, `PASS retention removed events`, the three count lines (8, 1, 1), two more PASS notices for the write checks, and the report rows. Any FAIL or error stops the run because of `ON_ERROR_STOP`.

**Option C: ask Claude Code.** Once the Supabase MCP server is authenticated (step 7), you can ask Claude Code to run the test and report the results.

### 5. Get the API keys

1. Go to **Project Settings**, then **API Keys**.
2. Copy the **Publishable key** (it starts `sb_publishable_`). If your dashboard only shows the older **anon** key under **Legacy API keys**, that works too.
3. Never copy the **secret** or **service_role** key into the app. It bypasses row-level security and belongs only in server-side jobs that are not built yet.

### 6. Put the keys in the app

From the repo root:

    cd apps/web
    copy .env.local.example .env.local

Open `.env.local` and fill in both lines:

    NEXT_PUBLIC_SUPABASE_URL=https://<project ref>.supabase.co
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

`.env.local` is ignored by git. Check with `git status`: it must not appear. Both values are safe for the browser to see, because row-level security in the database is what protects the data.

### 7. Authenticate the Supabase MCP server (optional, for Claude Code)

The repo's `.mcp.json` already points Claude Code at this project. To let it query the database, open a terminal in the repo root and run `claude`, then type `/mcp`, choose **supabase** and **Authenticate**. A browser window asks you to approve access; after that, start a new Claude Code session.

### 8. Install and run

    cd apps/web
    npm install
    npm run dev

Open http://localhost:3000. You should see the Privacy Desk placeholder page. Sign-in arrives in slice 2.

### Resetting the test data

To run the schema test again, remove what it inserted first. In the SQL editor:

    delete from pd.partners where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    delete from pd.bank_holidays where region = 'england-and-wales' and day in ('2024-12-25', '2024-12-26');
    drop owned by app_user;
    drop role app_user;

Deleting the partners cascades to their organisations, members, cases, pauses and events.

### If something goes wrong

- **`schema "pd" does not exist`** when running the test: the migration has not run, or ran in a different project. Check the project name at the top of the dashboard.
- **`relation "pd.x" already exists`** when running the migration: it has already run. Do not run it twice.
- **The app shows "Supabase is not configured"**: `.env.local` is missing, in the wrong folder (it belongs in `apps/web`), or the dev server was started before you created it. Restart `npm run dev`.
- **Queries from the app return an error about the schema or an empty list**: check step 3 (exposed schemas) and that `0002_api_access.sql` has run.
- **Lost the database password**: Project Settings, then Database, then **Reset database password**. The API keys do not change.

## Signing in (slice 2)

Sign-in is by magic link. Enter an email on `/sign-in`; Supabase emails a link; the link returns to `/auth/confirm`, which turns it into a session and sends you on. A first-time user names their consultancy on `/welcome` and becomes its partner administrator. Administrators are then asked to set up an authenticator app (TOTP) on `/settings/security`, and to enter a code on `/mfa` at each later sign-in.

Three dashboard settings make this work, all under **Authentication**:

- **URL Configuration**: Site URL `http://localhost:3000`, and `http://localhost:3000/auth/confirm` in the redirect URL allow list. Add the production address alongside when there is one.
- **Emails**: the built-in sender uses Supabase's default templates and allows only a few messages an hour. That is enough to test with, but set up a real sender (SMTP settings) before pilots.
- **Multi-Factor Authentication**: TOTP enabled.

Open the sign-in link in the same browser you asked for it in. The link carries a one-time code that only that browser can exchange.

### Proving isolation

Do this once after slice 2, and again after any change to policies in `supabase/migrations/`:

1. Sign in as user A (any address you can read). Name a consultancy, enrol an authenticator, add a client.
2. In a private window, sign in as user B (a second address, or a plus-address such as `you+b@example.com`). Name a different consultancy, add a client.
3. As B, open `/clients`. Only B's client is listed. Paste A's client URL (`/clients/<id>`) into the address bar: the page says not found.
4. As B, call the API directly with B's session and A's client id. In the browser console on any app page:

       const { data } = await (await import('/src/lib/supabase/client.ts')).createClient().from('organisations').select('*').eq('id', '<A client id>');
       console.log(data); // []

   An empty list is the pass. Row-level security hides the row rather than refusing the query.

The SQL version of the same proof is in `supabase/schema_test.sql` (the "Client separation" and "new user" sections).

## Cases (slice 3)

- `/cases` lists cases from `pd.v_case_deadlines`, soonest legal deadline first. Filters are in the URL (`status`, `type`, `client`, `q`).
- `/cases/new` logs a case by hand through `pd.create_case`, which numbers the reference per client (`EHT-001`).
- `/cases/<id>` shows the deadline block (the due date, then the working in numbered steps from `src/lib/clocks.ts`), the task list, the request text and the audit trail. Each task row opens its action in the right-hand panel; every action is one call to `pd.record_case_action`, which refuses anything the case's state does not allow and writes the audit event in the same transaction.
- The deadline block compares the engine's date with the view's. If they ever differ, a red warning appears on the case. Treat that as a bug in one of the two copies of the rules.
- Keyboard: `C` log a case, `/` search, `G` then `C` cases, `G` then `L` clients, `?` help, Ctrl+K palette.

## Inbox and AI (slice 4)

- `/inbox` lists new items; open one to see the message, the triage proposal and the accept form, prefilled from the proposal. Accept creates the case through `pd.accept_inbox_item`; decline needs a reason. `/inbox/paste` adds a message by hand and triages it at once.
- Triage (`src/lib/ai/triage.ts`) calls Claude with a fixed JSON schema. It falls back to the keyword check when the client has AI switched off, when `ANTHROPIC_API_KEY` is not set, or when the call fails, and the triage card says so.
- Letters: on a case page, "Letters" drafts an acknowledgement, ID request, clarification, extension notice or outcome into a box with a copy button. Without a key you get a template with gaps in square brackets. Nothing is sent from the app.

### AI key

Add `ANTHROPIC_API_KEY` to `.env.local` (server-side only; never with a `NEXT_PUBLIC_` prefix) and restart `npm run dev`. Requester messages are then sent to Anthropic for triage and drafting: sample data only until the slice 7 checklist is done.

### Inbound email (Postmark)

Each client has a forwarding address `<code>-<token>@<INBOUND_DOMAIN>`, shown on the client page once the domain is set. To wire it up:

1. Choose a domain or subdomain for inbound mail and, in Postmark, create a server with an inbound stream. Point the domain's MX record where Postmark says.
2. Set the inbound webhook URL to `https://<your app>/api/inbound/postmark?secret=<INBOUND_WEBHOOK_SECRET>`.
3. Put `INBOUND_DOMAIN` and a long random `INBOUND_WEBHOOK_SECRET` in the app's environment.

The route looks up the client by the token in the address, creates the inbox item through a function that only that token can call, and triages it. Duplicate deliveries (same Postmark message id) are dropped. To test locally without Postmark, post a sample payload:

    curl -X POST "http://localhost:3000/api/inbound/postmark?secret=$INBOUND_WEBHOOK_SECRET" -H "Content-Type: application/json" -d '{"FromName":"Pat Example","From":"pat@example.com","Subject":"My data","TextBody":"Please send me everything you hold about me.","MessageID":"test-1","OriginalRecipient":"<code>-<token>@example.test"}'

## Checks

    npm test          # deadline engine against the ICO worked examples (Vitest)
    npm run typecheck # tsc --noEmit
    npm run lint      # eslint
    npm run build     # production build

## Where things are

- `src/lib/clocks.ts` — the deadline engine, ported from `packages/clocks/clocks.js`. Keep the two in step until the open question in `docs/DECISIONS.md` is settled. Never change a date rule without a test built from an ICO worked example.
- `src/lib/supabase/` — browser and server clients. Both use the publishable key; row-level security in Postgres is the isolation boundary. Queries must select the `pd` schema, for example `supabase.schema("pd").from("cases")`.
- `src/components/ui/` — shadcn/ui components (base-nova style, neutral palette).
- `src/app/` — App Router pages.
