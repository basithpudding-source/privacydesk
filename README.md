# Privacy Desk

Case desk for UK data protection complaints and subject access requests, built for consultancies that look after many client organisations.

Start with `CLAUDE.md`, then `docs/NEXT-STEPS.md`.

Quick checks:

    node packages/clocks/clocks.test.js        # deadline engine: 14 tests
    # schema: run supabase/migrations/0001_initial.sql then supabase/schema_test.sql in Postgres
    open prototype/index.html                  # needs the Claude runtime for data; see the hosted copy instead
