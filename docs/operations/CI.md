# Skilit CI Contract

Status: bootstrap CI contract introduced by G00-03.

## Exact-HEAD rule

Every pull-request CI job checks out `github.event.pull_request.head.sha` directly. Push jobs check out `github.sha`. The `bootstrap` job verifies that SHA through `scripts/ci_hygiene.py`; the `graft` and isolated Node donor-test jobs verify it directly with Git before tooling runs.

A status from a different commit is not evidence for the candidate HEAD. GitHub first-party actions are pinned by full commit SHA to Node 24-compatible releases rather than moving major tags.

## Required hosted jobs

### `bootstrap`

The bootstrap job must pass:

The bootstrap job runs on the explicit `ubuntu-24.04` image with a 10-minute timeout. It installs CI-only Python dependencies from `requirements-ci.txt` with `--require-hashes`, `--no-deps`, and `--only-binary=:all:` before executing repository tooling. PyYAML is used only for safe YAML syntax/structure inspection; the provenance validator remains Python-standard-library-only.

- exact-HEAD verification;
- repository hygiene and relative-link validation;
- large-file and binary-corpus guardrails;
- Python compilation for the current bootstrap code;
- the repository unit-test suite;
- the canonical upstream provenance-lock validator.

Formal application lint/typecheck/build commands replace the bootstrap compile step as the imported application toolchain becomes canonical. A placeholder must never be reported as a real typecheck or production build.

### `graft`

The Graft job runs on the explicit `ubuntu-24.04` image with a 15-minute timeout. It uses pinned `@nanonets/graft@0.21.1` and must pass graph build and freshness checks on the exact candidate revision.

Graft output is architecture/change-impact evidence. It does not replace unit, integration, PStack review-panel, or Alibaba Open Code Review evidence.

### `web`

The web job runs on the explicit `ubuntu-24.04` image with a 15-minute timeout. It installs pnpm `9.12.0`, performs a frozen-lockfile install, and must pass the Skilit web application gate on the exact candidate revision:

- `eslint` over `apps/web`;
- strict `tsc --noEmit`;
- the Node.js test suites (`tests/node/`, `apps/web/tests/`);
- the Next.js production build;
- the production startup smoke (`scripts/smoke-web.mjs`), which boots `next start`, asserts the `/api/health` contract and the landing page, then shuts down.

A passing bootstrap compile or planning validator is never reported as this application gate.

### `worker`

The worker job runs on the explicit `ubuntu-24.04` image with a 15-minute timeout. It performs the same frozen install, then must pass the Skilit worker shell gate on the exact candidate revision:

- `eslint` over `apps/worker`;
- strict `tsc --noEmit`;
- the worker Node.js test suites (`apps/worker/tests/`);
- the `health` command, which validates the environment and prints the worker health contract.

### `skilit-screenshot-queue`

The isolated Skilit capture-queue module (vendored implementation detail) is validated in its own
hosted Node job before any public runtime activation. This exact-HEAD job uses
Node `22.23.1`, a pinned TypeScript `5.9.3` typecheck, and Node's native
type-stripping test runner against deterministic queue contract tests.

This test does **not** establish a production-ready capture system, persistent
worker queue, or an application build. It verifies one verbatim and provenance-
bound source file only. P01's final full application build/typecheck gates
remain open until their bounded implementation grains are qualified.

## Review evidence

The PStack review panel and Alibaba Open Code Review remain governed pre-merge review gates under `GOVERNANCE.md`. They are not replaced by unrelated external reviewer statuses.

The mandatory TypeSafe Jev gate was waived by founder decision `GD-2026-10-21-REVIEW-STACK`; see [`docs/governance/DECISION_2026-10-21_REVIEW_STACK_MIGRATION.md`](../governance/DECISION_2026-10-21_REVIEW_STACK_MIGRATION.md). Jev is no longer a merge or release gate, and historical Jev records are preserved as-is.

CodeRabbit, Cubic, Qodo, and similar reviewer statuses are not accepted as Skilit governance evidence even if GitHub displays them on a pull request.

## Failure behavior

The CI hygiene implementation is tested with deliberately invalid examples for:

- exact-HEAD mismatch;
- missing canonical files;
- broken relative Markdown links;
- trailing whitespace;
- NUL/non-UTF-8 text;
- malformed or duplicate-key JSON;
- malformed, empty, or duplicate-key YAML;
- invalid empty GitHub Actions trigger/job mappings;
- oversized files;
- oversized or excessive binary/media content;
- tracked generated/cache directories;
- missing, non-regular, or symlinked tracked paths;
- tracked Python bytecode.

These tests are part of the hosted `bootstrap` job, so weakening a guardrail requires a reviewed code and test change.

## Binary policy

Git stores source code, manifests, metadata, and small qualified fixtures. Bulk screenshots, videos, model weights, archives, databases, and generated corpora belong in the configured asset/object store, not repository history.

Current bootstrap caps are 5 MiB per tracked file, 2 MiB per binary/media file, 25 MiB aggregate recognized binary/media, and 100 MiB aggregate tracked repository content.

Any tracked file whose extension is not in the explicit binary allowlist is treated as UTF-8 text and receives text hygiene checks. Unknown opaque/binary formats therefore fail closed instead of bypassing validation. JSON and YAML duplicate mapping keys are rejected, YAML composition uses `SafeLoader`, and relative Markdown paths are normalized before target validation.

The bootstrap limits are intentionally conservative and may be changed only through a governed grain with a documented need.
