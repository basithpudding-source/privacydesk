# Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-08 | Sell first to DPO consultancies, not single organisations | One sale brings many client organisations; per-client pricing fits their retainers |
| 2026-11-08 | Deadline rules follow ICO guidance, tested against its worked examples | A wrong date is the product's worst failure |
| 2026-11-08 | AI never acts alone: a person confirms triage and sends letters | Keeps responsibility with the controller; limits harm from a misread |
| 2026-11-08 | Postgres with row-level security as the isolation boundary | Isolation must not depend on app code being perfect |
| 2026-11-08 | Next.js + Supabase + shadcn/ui | Largest ecosystem, best AI tooling support, hosted Postgres with auth and RLS in one service |

## Open questions

- Working name "Privacy Desk": check Companies House and the UK IPO trade mark register before branding.
- Scotland and Northern Ireland bank holidays: load from the GOV.UK feed in slice 6; until then England and Wales only.
- Should complaint outcomes have an internal target per client (default 28 days) or a fixed one? Ask the first pilots.
- Two copies of the deadline rules now exist: `packages/clocks/clocks.js` (JS, 14 tests) and `apps/web/src/lib/clocks.ts` (TypeScript, same tests plus typing). CLAUDE.md names the package as the single source of truth. Proposal: once slice 3 ships, make the TypeScript module the source and either retire `packages/clocks/` or turn it into a workspace package the app imports. Until then, change both and run both test suites.
