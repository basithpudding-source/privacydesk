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

1. Go to **Project Settings** (the cog at the bottom of the sidebar), then **Data API**.
2. Under **Exposed schemas**, add `pd` and save.

Skip this and every query from the app returns an error about the schema not being found, even though the tables exist.

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
