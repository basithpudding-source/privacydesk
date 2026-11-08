# Privacy Desk web app

The production Next.js app. Read the root `CLAUDE.md` and `docs/DESIGN-STANDARD.md` before building any screen.

## First-time setup

1. **Create the Supabase project** in the London region at supabase.com. Note the project URL and the publishable key from Project settings > API. (A legacy anon key works too.)
2. **Run the schema.** In the Supabase SQL editor, run `supabase/migrations/0001_initial.sql`, then `supabase/schema_test.sql`. Every row of the test output must say PASS.
3. **Set the keys.** Copy `.env.local.example` to `.env.local` and fill in both values. `.env.local` is ignored by git; never commit it, and never put the service role key anywhere the browser can reach.
4. **Install and run.**

       npm install
       npm run dev

   Open http://localhost:3000.

## Checks

    npm test          # deadline engine against the ICO worked examples (Vitest)
    npm run typecheck # tsc --noEmit
    npm run lint      # eslint
    npm run build     # production build

## Where things are

- `src/lib/clocks.ts` — the deadline engine, ported from `packages/clocks/clocks.js`. Keep the two in step until the open question in `docs/DECISIONS.md` is settled. Never change a date rule without a test built from an ICO worked example.
- `src/lib/supabase/` — browser and server clients. Both use the publishable key; row-level security in Postgres is the isolation boundary.
- `src/components/ui/` — shadcn/ui components (base-nova style, neutral palette).
- `src/app/` — App Router pages.
