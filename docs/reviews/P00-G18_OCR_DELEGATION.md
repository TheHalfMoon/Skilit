# P00-G18 Account Sessions — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G18` — let an account see and revoke its own sessions.
- Branch: `skilit/p00-g18-account-sessions`
- Canonical base SHA: `2b053d351385e5100f69494247d8aa42fe8a84be`
- Reviewed candidate HEAD: `a86565f7b64c341251b2678cb0d34917d22d7532`
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from origin/main --to a86565f7b64c341251b2678cb0d34917d22d7532 --format json`

- `total_files`: 18
- `reviewable_count`: **14**
- `excluded_count`: 4 — `docs/operations/CI.md`,
  `docs/qualification/AF-12_ACCEPTANCE_MATRIX.md`,
  `docs/qualification/DEV_READINESS_2026-10-17.md` and
  `docs/qualification/V1_LOCAL_ACCEPTANCE_CONTRACT.md`, all `unsupported_ext`
- `total_insertions`: 1781, `total_deletions`: 15
- `merge_base`: `2b053d351385e5100f69494247d8aa42fe8a84be`

**Reviewable (14):**

| File | Status | +/- |
| --- | --- | --- |
| `.github/workflows/ci.yml` | modified | +1 / -0 |
| `apps/web/app/account/page.tsx` | added | +293 / -0 |
| `apps/web/app/api/v1/auth/sessions/[id]/route.ts` | added | +43 / -0 |
| `apps/web/app/api/v1/auth/sessions/route.ts` | added | +62 / -0 |
| `apps/web/app/globals.css` | modified | +24 / -0 |
| `apps/web/components/session-access-banner.tsx` | modified | +4 / -1 |
| `apps/web/components/skilit-shell.tsx` | modified | +1 / -0 |
| `apps/web/lib/session.ts` | modified | +165 / -0 |
| `apps/web/tests/account-sessions.test.mjs` | added | +343 / -0 |
| `apps/web/tests/account-ui.test.mjs` | added | +87 / -0 |
| `apps/web/tests/browser-session.test.mjs` | modified | +5 / -2 |
| `packages/db/src/auth.ts` | modified | +108 / -0 |
| `packages/db/tests/account-sessions.test.mjs` | added | +260 / -0 |
| `scripts/smoke-auth-journey.mjs` | modified | +377 / -6 |

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

### Group 3 — the stylesheet and the documents

`apps/web/app/globals.css` adds nineteen lines of layout rules for the account page's
action row and table, plus one rule for an unavailable button. Every value is taken from
the stylesheet's existing scale, no colour token is introduced or changed, and the
brand-token drift test in `apps/web/tests/brand-identity.test.mjs` still passes, so the
stylesheet and `docs/brand/tokens.json` have not drifted. The four Markdown documents
are excluded from the reviewable set as `unsupported_ext`; they are the CI contract, the
readiness record, the acceptance matrix and the v1 Local contract, and the delegated
review covered them by reading them against the default group's correctness,
security, performance, maintainability and test-coverage questions. The one real defect
they carried — a readiness record that still called the delivered surface deferred, and
an acceptance matrix with no delta entry — was found and fixed during the PStack round.

## Resolution

Zero unresolved blocking findings. The one item carried forward — the session
identifier in the URL and in the DOM — is recorded as a known limitation in the pull
request body, with the reason it is not a credential.

## Egress classification

This grain ran the **delegated** workflow only. No provider-backed OCR review ran, so
**no diff, workspace content, credential, key material, `.env` content or unredacted log
left this machine**. The delegated review was performed by reading the exact diff and the
files it names, locally.
