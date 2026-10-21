# P00-G18 Account Sessions — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G18` — let an account see and revoke its own sessions.
- Branch: `skilit/p00-g18-account-sessions`
- Canonical base SHA: `2b053d351385e5100f69494247d8aa42fe8a84be`
- **Reviewed candidate HEAD: `8ec23c435b742d1404276497cdea768322f6f6a9`** — the code state
  that ships. The review rounds ran over `a86565f7b64c341251b2678cb0d34917d22d7532`,
  `a84ceb4bfae59019184ddc2f388155dea9a043f0` and
  `c5dc98c188475eae930085fcece1e45e01fe0ae6` before it; every commit between the base
  and the reviewed candidate was covered by one of the PStack rounds.
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from origin/main --to 8ec23c435b742d1404276497cdea768322f6f6a9 --format json`

- `total_files`: 20
- `reviewable_count`: **14**
- `excluded_count`: 6 — `docs/operations/CI.md`,
  `docs/qualification/AF-12_ACCEPTANCE_MATRIX.md`,
  `docs/qualification/DEV_READINESS_2026-10-17.md`,
  `docs/qualification/V1_LOCAL_ACCEPTANCE_CONTRACT.md` and the two review records under
  `docs/reviews/`, all `unsupported_ext`
- `total_insertions`: 2482, `total_deletions`: 14
- `merge_base`: `2b053d351385e5100f69494247d8aa42fe8a84be`

**Reviewable (14):**

| File | Status | +/- |
| --- | --- | --- |
| `.github/workflows/ci.yml` | modified | +1 / -0 |
| `apps/web/app/account/page.tsx` | added | +306 / -0 |
| `apps/web/app/api/v1/auth/sessions/[id]/route.ts` | added | +43 / -0 |
| `apps/web/app/api/v1/auth/sessions/route.ts` | added | +62 / -0 |
| `apps/web/app/globals.css` | modified | +24 / -0 |
| `apps/web/components/session-access-banner.tsx` | modified | +4 / -1 |
| `apps/web/components/skilit-shell.tsx` | modified | +1 / -0 |
| `apps/web/lib/session.ts` | modified | +165 / -0 |
| `apps/web/tests/account-sessions.test.mjs` | added | +343 / -0 |
| `apps/web/tests/account-ui.test.mjs` | added | +126 / -0 |
| `apps/web/tests/browser-session.test.mjs` | modified | +5 / -2 |
| `packages/db/src/auth.ts` | modified | +108 / -0 |
| `packages/db/tests/account-sessions.test.mjs` | added | +260 / -0 |
| `scripts/smoke-auth-journey.mjs` | modified | +377 / -6 |

The preview run against the earlier candidates gives the same reviewable **set** of
fourteen files and the same resolved rule groups:

| Candidate | total_files | reviewable_count | excluded_count | insertions | deletions |
| --- | --- | --- | --- | --- | --- |
| `a86565f` (rounds 1-2) | 18 | 14 | 4 | 1781 | 15 |
| `a84ceb4` (round 3) | 20 | 14 | 6 | 2295 | 14 |
| `8ec23c4` (reviewed candidate) | 20 | 14 | 6 | 2482 | 14 |

Between those candidates the reviewable files that changed were
`apps/web/app/account/page.tsx` and `apps/web/tests/account-ui.test.mjs`, and both are
re-reviewed below at their final content. The merge candidate adds only the two
excluded Markdown records, so its reviewable count, its excluded set and its resolved
rule groups are the same as the ones quoted here; only the excluded insertions move.


## Resolved rules

`ocr delegate rule` resolved, for this file set, into three groups:

- **group 1 — system / `.github/workflows/**/*.{yaml,yml}`** for `.github/workflows/ci.yml`.
- **group 2 — system / `**/*.{ts,js,tsx,jsx,mjs,cjs}`** for the account page, the two
  routes, the banner, the shell, `apps/web/lib/session.ts`, the three test files,
  `packages/db/src/auth.ts` and the smoke.
- **group 3 — system / `default`** for `apps/web/app/globals.css` and the four excluded
  Markdown documents.

## Delegated review executed against the exact diff

### Group 1 — the CI workflow

The only change to the workflow is one added line in the `db-foundation` job's test
list, naming the new database test file. Checked against the resolved rules: no
`pull_request_target`, no secret is referenced or printed, `permissions` is unchanged, no
action is added or unpinned, no `github.event.*` expression reaches a `run:` block, no
credential is hardcoded, `fetch-depth` and the job dependencies are unchanged, no matrix
leg was added and no `fail-fast` was introduced, every job keeps its timeout and the
workflow keeps its `concurrency` group, no `continue-on-error` was added and no step was
weakened or skipped, and no container tag was touched. The test file it names exists and
passes. No finding.

### Group 2 — the TypeScript and JavaScript sources

Checked against the resolved rules: no spelling errors in identifiers or in user-facing
messages; no dead code — every new export has a caller, and the branch the parsimony
judge called unreachable was removed; the duplication rule is the one judgement call.
`asRecord` and `readFailure` are re-implemented per page, as `boards/page.tsx`,
`flows/page.tsx` and `gallery/page.tsx` already do, and the PStack parsimony judge
confirmed that as an established repository pattern rather than a regression. The
request-and-failure handling, which the same judge flagged as triplicated, is now the
single `callJson` helper the other pages already use. No business rule is hardcoded
outside the `ROUTES` map that already centralises the smoke's paths; no `var`; no `==` or
`!=`; no `any` — every parsed value is `unknown` and narrowed; null checks are present on
every dereference; no nested ternary. On React: hooks are called at the top level, the
effect depends on a `useCallback`-stable `load` and aborts its request on unmount, state
is local to the page, there are no render side effects, no inner component is declared
inside a component, and the page carries no inline styles — the presentation is in the
stylesheet, which is where the repository keeps its display tokens. On async handling:
every request is awaited, the JSON parse is guarded, and the abort is not reported as a
failure. On security: no `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no
`Function`, no `document.write`, no browser storage, no bearer token from the browser, and
no modification of a native prototype.

Two things are worth stating plainly rather than passing over:

- The session identifier travels in the URL path and is rendered in the table, so it
  lands in browser history and in same-origin access logs. It is not a credential —
  revocation is gated on the owning `user_id`, and the stored token is a SHA-256 hash —
  so this is a naming and hygiene matter, not a privilege leak.
- The rate-limit key on the new routes is `auth:${clientKey(request, null)}`, which is
  spoofable through `x-forwarded-for`. That is the pre-existing pattern shared with
  sign-in, sign-up and sign-out, the limiter documents itself as best-effort with the
  gateway owning authoritative enforcement, and these routes additionally require a
  valid session. Not introduced here.

No blocking finding.

### The two files that changed between the reviewed candidates, re-reviewed at final content

Between the round-1 and round-2 candidate and the round-3 candidate, exactly two
reviewable files changed. They are re-reviewed here at their final content, against the
same resolved group-2 rules.

**`apps/web/app/account/page.tsx`.** The final content differs from the version
reviewed in rounds 1 and 2 in six ways: `callJson` is memoised with `useCallback` and
an empty dependency list; it gained an optional `onFailed` callback, typed
`(status: number | undefined) => void | Promise<void>`, invoked with the HTTP status on
a refusal and with `undefined` when the request never completed; the 404 handling moved
from a dedicated parameter into the revoke action's own `onFailed`; the bulk button's
handler guard now names the same condition as its `aria-disabled`; `load` now depends on
`[callJson]`; and the catch branch reaches the same transition as a refusal, so a
request that never completed cannot leave a stale table on screen next to the error.
Checked against the group-2 rules: no spelling error, no dead code — `onFailed` is
reached from both the refusal path and the catch path, and the `undefined` argument is
what distinguishes a request that never completed from one the server refused, so a
transport failure cannot be mistaken for a 404 — no duplicated logic, comments that
state what the code does, no hardcoded business value outside the page's own user-facing
strings, no `var`, no `==`, no `any`, null checks on every dereference, no nested ternary,
hooks called at the top level, `useCallback` and `useEffect` dependency arrays correct
and stable, no render side effect, no inline style, no inner component, every request
awaited with error handling, and no XSS, `innerHTML`, `eval`, `Function`,
`document.write`, browser storage, bearer token or prototype modification anywhere in
the file. No finding.

**`apps/web/tests/account-ui.test.mjs`.** The final content adds one test and one
further assertion to it. The test reads the page as text and asserts that the
announcement and the guard on the bulk button name the same condition, and that both
the refusal path and the catch path reach the unavailable transition; the further
assertion requires the catch path to call the hook with no HTTP status, so that a
transport failure cannot take the revoke action's 404 branch. It contains no business
logic, no credential, and no unsafe construct; the rules that apply to it are the same
code-quality rules as for the production files, and it satisfies them. No finding.

### Group 3 — the stylesheet and the documents

`apps/web/app/globals.css` adds nineteen lines of layout rules for the account page's
action row and table, plus one rule for an unavailable button. Every value is taken from
the stylesheet's existing scale, no colour token is introduced or changed, and the
brand-token drift test in `apps/web/tests/brand-identity.test.mjs` still passes, so the
stylesheet and `docs/brand/tokens.json` have not drifted.

The four excluded Markdown documents were read against the default group's correctness,
security, performance, maintainability and test-coverage questions. Their state differs
between the two reviewed candidates, and each candidate's state is described as it
actually was:

- At the round-1 and round-2 candidate `a86565f`, the acceptance matrix's
  "Review-stack migration" bullet had been split in two by the splice that inserted
  the new PR #168 entry into the middle of it, leaving an orphaned tail that made a
  false claim about the pull request and contradicted the same file's own rule that
  historical entries are preserved. This delegated review did not report that defect;
  the round-2 product judge found it. It is fixed from the round-3 candidate onward,
  where the matrix is one added line against `origin/main` and the historical bullet is
  byte-for-byte identical.
- At the reviewed candidate `8ec23c4`, the matrix carries a correct, separate PR #168
  entry. The readiness record no longer describes the session list/revoke-all UI as
  deferred, and the v1 Local contract's supported-surface list names the account
  surface.

The CI contract names the fourth disposable database and the fourth browser journey, and
matches what the smoke actually does.

## Resolution

Zero unresolved blocking findings. The one item carried forward — the session
identifier in the URL and in the DOM — is recorded as a known limitation in the pull
request body, with the reason it is not a credential.

## Egress classification

This grain ran the **delegated** workflow only. No provider-backed OCR review ran, so
**no diff, workspace content, credential, key material, `.env` content or unredacted log
left this machine**. The delegated review was performed by reading the exact diff and the
files it names, locally.
