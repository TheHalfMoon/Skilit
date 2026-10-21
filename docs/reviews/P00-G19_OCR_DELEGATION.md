# P00-G19 Operator Invitations — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G19` — let an operator invite another person to a workspace.
- Branch: `skilit/p00-g19-operator-invites`
- Canonical base SHA: `31fdeff91015cd42599eb1c4d92a68e36065e259`
- **Reviewed candidate HEAD: `ed8f5f3`** — the candidate the final-candidate
  judge read. The code state that ships is that candidate plus the changes the
  final-candidate judge's findings required: the three failure answers the
  invitation route module had copied instead of importing, and the two view
  mappers that only copied their input's fields. Every commit between the base
  and the reviewed candidate was covered by one of the PStack rounds recorded in
  `docs/reviews/P00-G19_PSTACK_PANELS.md`.
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from origin/main --to ed8f5f3 --format json`

- `total_files`: 52
- `reviewable_count`: **46**
- `excluded_count`: 6 — the two review records under `docs/reviews/`,
  `docs/operations/CI.md`, `docs/qualification/AF-12_ACCEPTANCE_MATRIX.md`,
  `docs/qualification/DEV_READINESS_2026-10-17.md` and
  `docs/qualification/V1_LOCAL_ACCEPTANCE_CONTRACT.md`, all `unsupported_ext`
- `total_insertions`: 5478, `total_deletions`: 173
- `merge_base`: `31fdeff91015cd42599eb1c4d92a68e36065e259`

**Reviewable (46):**

| File | Status | +/- |
| --- | --- | --- |
| `.github/workflows/ci.yml` | modified | +2 / -0 |
| `apps/web/app/account/page.tsx` | modified | +18 / -39 |
| `apps/web/app/api/v1/boards/route.ts` | modified | +3 / -50 |
| `apps/web/app/api/v1/invites/[token]/accept/route.ts` | added | +39 / -0 |
| `apps/web/app/api/v1/invites/[token]/route.ts` | added | +34 / -0 |
| `apps/web/app/api/v1/workspaces/[id]/invites/[inviteId]/route.ts` | added | +28 / -0 |
| `apps/web/app/api/v1/workspaces/[id]/invites/route.ts` | added | +56 / -0 |
| `apps/web/app/api/v1/workspaces/[id]/members/route.ts` | added | +27 / -0 |
| `apps/web/app/globals.css` | modified | +3 / -0 |
| `apps/web/app/invite/[token]/page.tsx` | added | +283 / -0 |
| `apps/web/app/invite/layout.tsx` | added | +19 / -0 |
| `apps/web/app/login/page.tsx` | modified | +20 / -0 |
| `apps/web/app/workspaces/page.tsx` | added | +505 / -0 |
| `apps/web/components/skilit-shell.tsx` | modified | +1 / -0 |
| `apps/web/lib/browser-envelope.ts` | added | +76 / -0 |
| `apps/web/lib/invites.ts` | added | +396 / -0 |
| `apps/web/lib/rest-guard.ts` | added | +119 / -0 |
| `apps/web/lib/safe-destination.ts` | added | +29 / -0 |
| `apps/web/next.config.ts` | modified | +20 / -10 |
| `apps/web/tests/account-ui.test.mjs` | modified | +16 / -12 |
| `apps/web/tests/browser-session.test.mjs` | modified | +9 / -2 |
| `apps/web/tests/invites.test.mjs` | added | +576 / -0 |
| `apps/web/tests/safe-destination.test.mjs` | added | +61 / -0 |
| `apps/web/tests/workspaces-ui.test.mjs` | added | +226 / -0 |
| `packages/db/migrations/019_workspace_invites.down.sql` | added | +5 / -0 |
| `packages/db/migrations/019_workspace_invites.up.sql` | added | +38 / -0 |
| `packages/db/src/auth.ts` | modified | +6 / -1 |
| `packages/db/src/invites.ts` | added | +592 / -0 |
| `packages/db/src/workspaces.ts` | modified | +53 / -18 |
| `packages/db/tests/auth.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/billing.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/build-kit.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/collections.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/db-foundation.test.mjs` | modified | +5 / -5 |
| `packages/db/tests/graph.test.mjs` | modified | +3 / -3 |
| `packages/db/tests/invites.test.mjs` | added | +789 / -0 |
| `packages/db/tests/jobs.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/pg-build-kit.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/pg-graph.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/pg-integration.test.mjs` | modified | +2 / -2 |
| `packages/db/tests/pg-invites.test.mjs` | added | +331 / -0 |
| `packages/db/tests/pg-workflows.test.mjs` | modified | +1 / -1 |
| `packages/db/tests/workflows.test.mjs` | modified | +3 / -3 |
| `packages/db/tests/workspaces.test.mjs` | modified | +1 / -1 |
| `scripts/smoke-auth-journey.mjs` | modified | +354 / -4 |
| `tests/node/security-headers.test.mjs` | modified | +15 / -3 |

The reviewable set grows as the grain grows, and every file that entered it
entered it with the grain's own code or tests. The excluded set is the
Markdown: three documents at the first candidate, four at the second, and six
at the reviewed candidate, when the two review records joined them.

| Candidate | total_files | reviewable_count | excluded_count | insertions | deletions |
| --- | --- | --- | --- | --- | --- |
| `f892a49` (first round) | 35 | 32 | 3 | 2782 | 41 |
| `ef3b168` (second round) | 46 | 42 | 4 | 4257 | 153 |
| `6549bcf` (the delta re-reviews) | 50 | 46 | 4 | 4756 | 173 |
| `b92ac3e` | 50 | 46 | 4 | 4773 | 173 |
| `ed8f5f3` (reviewed candidate) | 52 | 46 | 6 | 5478 | 173 |

Every row is the value `ocr delegate preview --from origin/main --to <sha>
--format json` reports, measured at the reviewed candidate's tree; the
final-candidate judge reproduced the `ed8f5f3` row independently.

The merge candidate differs from the reviewed candidate by the three failure
answers the invitation route module had copied instead of importing, the two
view mappers that only copied their input's fields, and the two review
records. The first two are reviewable files that are already in the set, so
the merge candidate's reviewable count, its excluded set and its resolved
rule groups are the ones quoted here; only the excluded insertions and the
content of two reviewable files move.

## Resolved rules

`ocr delegate rule` resolved, for the reviewed candidate's file set, into three groups:

- **group 1 — system / `.github/workflows/**/*.{yaml,yml}`** for `.github/workflows/ci.yml`.
- **group 2 — system / `**/*.{ts,js,tsx,jsx,mjs,cjs}`** for the two pages, the two new
  libraries, the three route modules, the guard, the five API route files, the four test
  files, the two database source files, the two migration files, the smoke and the
  security-header test.
- **group 3 — system / `default`** for `apps/web/app/globals.css` and the four excluded
  Markdown documents.

One distinction worth recording, because the two commands answer different questions:
`ocr delegate rule` resolves a rule group for every path it is given, so the two review
records under `docs/reviews/` resolve to the default group; `ocr delegate preview`
filters the diff by the file types the reviewable set supports, so those same two records
are excluded with `unsupported_ext` and are not part of the reviewable set. The rule
groups below therefore govern the 46 reviewable files, and the four excluded Markdown
documents were read against the default group's questions by hand.

## Delegated review executed against the exact diff

### Group 1 — the CI workflow

The change to the workflow is two added lines in the `db-foundation` job: one
in the domain-test file list and one `node --experimental-strip-types --test
packages/db/tests/pg-invites.test.mjs` in the real-PostgreSQL step. Checked
against the resolved rules: no `pull_request_target`, no secret is referenced or
printed, `permissions` is unchanged, no action is added or unpinned, no
`github.event.*` expression reaches a `run:` block, no credential is
hardcoded, `fetch-depth` and the job dependencies are unchanged, no matrix leg
was added and no `fail-fast` was introduced, every job keeps its timeout and
the workflow keeps its `concurrency` group, no `continue-on-error` was added and
no step was weakened or skipped, and no container tag was touched. The test
file the workflow names exists and passes. No finding.

### Group 2 — the TypeScript, JavaScript and SQL sources

Checked against the resolved rules: no spelling errors in identifiers or in user-facing
messages; no dead code — the envelope reader's two helpers are module-private, the
invitation page's dead notice state is gone, and the guard's answer names the caller it
resolved; the duplication rule is the judgement call, and the request-guard block, the
envelope helpers and the three failure answers that were copied into several files now
live in three shared modules that the grain's own routes use. No business rule is
hardcoded outside the repository's existing constants; no `var`; no `==` or `!=`; no
`any` — every parsed value is `unknown` and narrowed; null checks are present on every
dereference; no nested ternary. On React: hooks are called at the top level, the effects
depend on stable callbacks and abort their requests on unmount, state is local to the
page, there are no render side effects, no inner component is declared inside a
component, and the pages carry no inline styles — the presentation is in the stylesheet,
which is where the repository keeps its display tokens. On async handling: every
request is awaited, the JSON parse is guarded, and an aborted request is not reported as
a failure. On security: no `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no
`Function`, no `document.write`, no browser storage, no bearer token from the browser,
and no modification of a native prototype. The sign-in destination is resolved with the
browser's own URL parser and refused unless it stays on this origin and is a single
leading slash.

Two things are worth stating plainly rather than passing over:

- The invitation token travels in the URL path of the invitation page and of the two
  API routes. The page path is unavoidable — the link has to survive being re-shared
  through arbitrary channels, and a fragment-borne token is dropped by some mail
  clients — and the API path carries the same token to the same access logs, so moving
  it removes no log entry. The invitation surface answers with
  `Referrer-Policy: no-referrer`, verified against the running production server, and
  the token is stored only as a SHA-256 hash.
- The rate-limit key on the invitation routes is `auth:${clientKey(request, null)}`,
  which is spoofable through `x-forwarded-for`. That is the pre-existing pattern shared
  with sign-in, sign-up and sign-out, the limiter documents itself as best-effort with
  the gateway owning authoritative enforcement, and the acceptance route is additionally
  origin checked. Not introduced here.

No blocking finding.

### The two migrations

`019_workspace_invites.up.sql` creates one table and three indexes: the token hash is
unique and constrained to a SHA-256 digest, the address is bounded and non-empty, the
role is constrained to the three roles the roster already understands, and a partial
unique index holds one live invitation per workspace and address. Every value is a
literal; there is no interpolation, no dynamic SQL and no extension. The down migration
drops the table, which drops its indexes with it, and the rehearsal test proves the
round trip. No finding.

### Group 3 — the stylesheet and the documents

`apps/web/app/globals.css` adds three lines for one full-width field class. Every
value is taken from the stylesheet's existing scale, no colour token is introduced or
changed, and the brand-token drift test in `apps/web/tests/brand-identity.test.mjs`
still passes, so the stylesheet and `docs/brand/tokens.json` have not drifted.

The four excluded Markdown documents were read against the default group's correctness,
security, performance, maintainability and test-coverage questions. Each describes what
the code does: the CI contract names the fifth disposable database and the fifth
browser journey, and the invitation journey it describes is the one the smoke runs; the
acceptance matrix's P04 row names the invitation surface, its tests and its security
properties; the v1 Local contract's supported-surface list names both branches of the
invitation — creating an account from the link, and signing in as the invited address
and accepting; and the readiness record no longer describes the operator invite flow as
deferred. No finding.

## Resolution

Zero unresolved blocking findings. The items carried forward — the token in the URL, the
token's disclosure of the invited address, the operator's trust in the link, and the
status code that distinguishes a refused registration — are recorded as known
limitations in the pull request body, in the acceptance matrix's P04 row and in the
panel record, with the reason each is not a hole.

## Egress classification

This grain ran the **delegated** workflow only. No provider-backed OCR review ran, so
**no diff, workspace content, credential, key material, `.env` content or unredacted log
left this machine**. The delegated review was performed by reading the exact diff and the
files it names, locally.
