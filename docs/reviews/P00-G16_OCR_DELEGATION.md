# P00-G16 Authenticated Browser E2E — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G16` — prove a real authenticated browser journey on an isolated database.
- Branch: `skilit/p00-g16-authenticated-browser-e2e`
- Canonical base SHA: `c6f687dec480f8c7ea76531d149a8105c1f0f02c`
- Reviewed candidate HEAD: `47424791152a21b2f18bd9891f47b07a00aaf60b`
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from origin/main --to 47424791152a21b2f18bd9891f47b07a00aaf60b --format json`

- `total_files`: 8
- `reviewable_count`: **6**
- `excluded_count`: 2 — `docs/operations/CI.md` and `docs/operations/CLEAN_INSTALL.md`,
  both `unsupported_ext`
- `total_insertions`: 1105, `total_deletions`: 12

**Reviewable (6):**

| File | Status | +/- |
| --- | --- | --- |
| `.github/workflows/ci.yml` | modified | +7 / -1 |
| `apps/web/lib/mcp-db.ts` | modified | +46 / -9 |
| `apps/web/tests/data-dir-permissions.test.mjs` | added | +51 / -0 |
| `scripts/lib/log-redaction.mjs` | added | +67 / -0 |
| `scripts/smoke-auth-journey.mjs` | added | +845 / -0 |
| `tests/node/auth-journey-redaction.test.mjs` | added | +81 / -0 |

## Resolved rules

`ocr delegate rule` resolved, for this file set:

- **system / `**/*.{yaml,yml}`** for the CI workflow.
- **system / `**/*.{js,mjs,cjs,jsx,ts,tsx}`** for the smoke, the redaction module and
  the two test files.
- **system / `**/*.{ts,tsx}`** for `apps/web/lib/mcp-db.ts`.

## Delegated review executed against the exact diff

- **`.github/workflows/ci.yml`.** The only changes to the workflow are the `web` job's
  timeout (15 to 30 minutes) and one new step that runs the smoke after the production
  build and the pinned Chromium headless-shell install. No action is added or unpinned, no
  secret is referenced, no `continue-on-error` is introduced, and no existing step is
  weakened, skipped or reordered. The three ports the smoke binds (3105-3107) do not
  collide with the plain startup smoke (3103) or the brand chrome smoke (3104).
- **`apps/web/lib/mcp-db.ts`.** The database selection now prefers an explicit connection
  string, then an absolute PGlite data directory, then the in-memory fallback. The
  precedence is unchanged from the base, so an existing deployment that sets a URL is not
  redirected. The only new behaviour is that a data directory must be absolute and is
  tightened to owner-only permissions, because it holds password verifiers and
  session-token hashes. A relative path fails closed with an opaque error rather than
  writing to an unexpected location.
- **`scripts/smoke-auth-journey.mjs`.** The script is a test harness: it starts a local
  production server on loopback, drives a pinned Chromium against it, and asserts on real
  HTTP and database behaviour. It reaches no host other than 127.0.0.1, and it reads no
  credential it did not create. Every value it uses is a synthetic `@skilit.example`
  identity or a throwaway password. The script's own protections were re-read against
  the code: the environment pre-flight that refuses to run when a Next.js environment file
  declares a database URL, the redaction applied to every byte the server writes to
  stdout, the owner-only disposable directory, and the teardown that removes the
  directory on exit and on interrupt.
- **`scripts/lib/log-redaction.mjs`.** A small, dependency-free module whose only job is
  to remove secrets from text on the way to a log. It holds no secret itself: the
  secrets are supplied by the caller. The regular-expression escaping is correct for
  metacharacters, the patterns are global, and the carry-over buffer is sized from the
  longest registered secret.
- **The two test files.** `tests/node/auth-journey-redaction.test.mjs` asserts the
  redaction behaviour directly, including a secret split at every possible split point.
  `apps/web/tests/data-dir-permissions.test.mjs` asserts the directory-mode invariant
  against a real temporary directory, including the case of a pre-existing world-readable
  directory. Neither file contains a secret, a network call, or a dependency outside the
  repository.

## Findings

**Zero unresolved blocking findings.**

Every finding raised in this grain — one must-fix and four worth-considering from the
first security round, and the further findings from the later rounds — was fixed before
the reviewed candidate. They are enumerated in `docs/reviews/P00-G16_PSTACK_PANELS.md`.

## Scope honesty

- OCR did not scan anything. It resolved the applicable rule groups and produced the
  preview; the review of the diff against those groups was performed by the host agent
  and by five independent fresh-context PStack judge sessions, three of them dedicated
  security judges.
- This record must not be read as an external model scan, an OCR-provided verdict, or a
  provider-backed review.
