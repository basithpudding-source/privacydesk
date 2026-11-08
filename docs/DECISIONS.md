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
| 2026-11-08 | Every case action is one database function call (`pd.record_case_action`) that changes the case and writes its audit event in the same transaction | Two statements from the app could leave a change without its event. The function also refuses impossible actions, so the rules live in one place |
| 2026-11-08 | Case references are `<client code>-<number>`, numbered per client and never reused | Short enough to quote on the phone; the client code makes the owner obvious in a mixed list |
| 2026-11-08 | Action dates may not be in the future | A deadline worked out from a future date would be fiction; backdating is allowed because requests are often logged late |
| 2026-11-08 | Inbound email is keyed by a per-client token in the forwarding address, through definer-rights functions the anonymous role may call | The app then needs no service key anywhere. The anonymous role has usage on the `pd` schema so those functions resolve, but no table grants |
| 2026-11-08 | Triage uses Claude Opus 5.5 at low effort with a fixed JSON schema; the keyword check runs when a client has AI off, no key is set, or the call fails | The screen always says which one spoke. A person confirms every result and the audit event records both |
| 2026-11-08 | Letter drafts are copied, never sent | The app never sends email on its own (CLAUDE.md). The person sends from their own mailbox |

## Open questions

- Working name "Privacy Desk": check Companies House and the UK IPO trade mark register before branding.
- Scotland and Northern Ireland bank holidays: load from the GOV.UK feed in slice 6; until then England and Wales only.
- Should complaint outcomes have an internal target per client (default 28 days) or a fixed one? Ask the first pilots.
- Inbound email domain: forwarding addresses need a domain whose MX records point at Postmark (or Resend inbound). Which domain, and who owns the Postmark account? Until then the client page shows the address without a domain.
- AI provider terms: requester messages go to Anthropic for triage and drafting. The slice 7 checklist needs the data processing agreement and no-training terms confirmed before any real data; the per-client switch already exists.
- Display names: the audit trail can only say "you" or a shortened user id, because nothing stores a person's name. A small profiles table (user id, name) filled at first sign-in would fix it. Which slice?
- Inviting colleagues: the first user is the consultancy's only member. Adding a second admin or a client user needs an invitation flow (email, accept, membership row). Which slice, and should client users sign in at all in the first version?
- Supabase's built-in email sender allows only a few messages an hour, which limits sign-in testing. Wire a real sender (Resend or Postmark, needed for slice 4 anyway) before pilots.
- Two copies of the deadline rules now exist: `packages/clocks/clocks.js` (JS, 14 tests) and `apps/web/src/lib/clocks.ts` (TypeScript, same tests plus typing). CLAUDE.md names the package as the single source of truth. Proposal: once slice 3 ships, make the TypeScript module the source and either retire `packages/clocks/` or turn it into a workspace package the app imports. Until then, change both and run both test suites.
