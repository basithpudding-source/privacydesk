# Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-08 | Sell first to DPO consultancies, not single organisations | One sale brings many client organisations; per-client pricing fits their retainers |
| 2026-11-08 | Deadline rules follow ICO guidance, tested against its worked examples | A wrong date is the product's worst failure |
| 2026-11-08 | AI never acts alone: a person confirms triage and sends letters | Keeps responsibility with the controller; limits harm from a misread |
| 2026-11-08 | Postgres with row-level security as the isolation boundary | Isolation must not depend on app code being perfect |
| 2026-11-08 | Next.js + Supabase + shadcn/ui | Largest ecosystem, best AI tooling support, hosted Postgres with auth and RLS in one service |
| 2026-11-08 | The Data API grants reach the signed-in role only; the anonymous role gets nothing in `pd` | The public form (slice 5) will write through a server route, so nothing needs anonymous table access; Supabase's standard grants would open every table to it |
| 2026-11-08 | Next.js Cache Components switched off for now | Every page is per-user, so there is nothing to prerender yet, and with it on each session read needs its own Suspense boundary. Revisit when a public page is worth caching |
| 2026-11-08 | A new user creates their consultancy through `pd.create_partner`, a definer-rights function, and becomes its admin | `partners` has no insert policy and a membership can only be added by an existing admin, so nothing else could bootstrap the first user |
| 2026-11-08 | Partner admins must enrol an authenticator app; the app sends them to enrol or to enter a code before the desk | Admins can read every client's data. Enforcement in the database itself (an `aal2` check in the policies) joins the slice 7 checklist |

## Open questions

- Working name "Privacy Desk": check Companies House and the UK IPO trade mark register before branding.
- Scotland and Northern Ireland bank holidays: load from the GOV.UK feed in slice 6; until then England and Wales only.
- Should complaint outcomes have an internal target per client (default 28 days) or a fixed one? Ask the first pilots.
- Inviting colleagues: the first user is the consultancy's only member. Adding a second admin or a client user needs an invitation flow (email, accept, membership row). Which slice, and should client users sign in at all in the first version?
- Supabase's built-in email sender allows only a few messages an hour, which limits sign-in testing. Wire a real sender (Resend or Postmark, needed for slice 4 anyway) before pilots.
- Two copies of the deadline rules now exist: `packages/clocks/clocks.js` (JS, 14 tests) and `apps/web/src/lib/clocks.ts` (TypeScript, same tests plus typing). CLAUDE.md names the package as the single source of truth. Proposal: once slice 3 ships, make the TypeScript module the source and either retire `packages/clocks/` or turn it into a workspace package the app imports. Until then, change both and run both test suites.
