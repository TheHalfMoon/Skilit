# Skelet v1 Local Release Decision Record — CONDITIONAL GO (Owner Gates Pending)

Status: DECISION RECORD (not a publication). Base: `d49ceb8` (PR #146 merge, exact-head CI SUCCESS 15/15, post-merge CI SUCCESS).
Scope: answer **Is Skelet v1 Local ready for release?** with the 15 mandated fields. All eligible engineering is complete; the candidate ships nothing until OD-01/OD-02/OD-03/OD-05 are explicitly recorded. Machine-checked by `tests/test_release_decision.py` (offline).

Review-stack superseding note (2026-10-21, `GD-2026-10-21-REVIEW-STACK`): the Jev mentions below are historical statements of the reviews that ran for the cited pulls; they are preserved verbatim and are not a current gate.

## 1. Candidate version
`v1.0.0-local-rc.1` (proposal only — `package.json` stays `0.1.0`, no git tag exists or is created here).

## 2. Exact commit SHA
`d49ceb8` (PR #146 merge). Runtime product code under `apps/` + `packages/` is byte-identical to the RERUN_4-qualified code `70da1ba` (`git diff --stat 70da1ba..HEAD -- apps packages` is empty); every change since is docs, conformance tests, review records, or the release-tooling script (each covered by its own exact-head CI 15/15).

## 3. Supported operating systems
macOS (measured isolated proof `CLEAN_INSTALL_PROOF.md`) and Linux ubuntu-24.04 (exact-head CI 15/15 on every head). Windows is NOT claimed beyond the `storage-windows-latest` CI job.

## 4. Supported installation method
Reproducible source release only: frozen lockfiles (`pnpm install --frozen-lockfile`, pnpm 9.12.0), PostgreSQL 17 + local filesystem store, no secrets required, procedure `docs/operations/CLEAN_INSTALL.md`, builder `scripts/build_release_candidate.mjs`.

## 5. Supported features
Contract §4 truth statement: install/start/health; PG + local storage; web UI (gallery/flows/patterns/boards/Lens/privacy/terms/support); REST v1 + MCP (30 tools) + TS/Python SDKs + CLI + stdio; deterministic search/similar/compare/changes; Lens URL-to-report + URL-to-Build-Kit with installing starter; collections/boards/packs with second-client recovery; replay of recorded sessions; VectorCraft/PhotoCraft/OpenPencil headless adapters (disabled-by-default, genuine-binary qualified); quotas/rate/abuse evaluator + operator CLI; backup/restore drill + runbook; SBOM + scans + rehearsal; no-model operation with all AI keys absent.

## 6. Features intentionally absent
Live browser recording; semantic/visual embeddings + hybrid ranker; MCP Apps `ui://` views; scheduled watch/subscribe + change scoring; fig-at-scale guarantees + PageDraw transplant; production R2/S3 at scale; hosted dashboards/alerting; production-scale load proof; officially signed artifact; formal commercial terms. Each maps to a Cloud backlog row with triggers (CB-01–CB-19).

## 7. Qualification evidence
- `AF-12_FINAL_RERUN_4.md`: zero failures on the RC code (lint/typecheck 11/11, python 227/227, web/worker 170/170 batched locally + combined in CI, assets 35/35, ingest 14/14, providers 39/39, adapters 69+1 skip, lens 197/197 incl. real Chromium, db 146/146, real PG 15/15, validators/SBOM/hygiene/sign/bundle PASS, build/smoke/starter/registry PASS, graft green).
- `CLEAN_INSTALL_PROOF.md`: genuine isolated worktree execution at `9d73f79`, zero failures across all 15 mandate steps (runtime-identical code to this HEAD per §2).
- This session: PRs #142–#146 (contract, backlog, clean-install, RC-prep, #62 report), each normal merge with exact-head + post-merge CI SUCCESS 15/15, genuine Jev ok:true, labeled OCR delegation/fallback, Graft green.
- UX/product-quality audit (this grain, static + test-backed): no `coming soon`/placeholder controls in `apps/web/{app,lib}`; `aria-live` on all 5 primary pages; loading/empty/error/filtered states asserted in source tests (`gallery-ui`, `flows-ui`, `patterns-ui`, `boards-ui`, `lens-ui`); home footer links `/privacy` `/terms` `/support` (all prerendered, 174 B each); Skelet branding in layout title; disabled-state handling on board/flow actions; no live-recording advertisement (replay-only honesty); E2E = fresh production build + `SMOKE_OK` + `STARTER_CONSUMER_OK` + `REGISTRY_INSTALL_PROOF_OK` + real-Chromium lens tests + golden-journey/interop suites. No mock-equivocated production interop is claimed.

## 8. Security findings
Zero unresolved blocking findings. One genuine historical leak class found and fixed in-tree (AF-14c similarity-gate cross-tenant narrowing, PR #117, with regression tests). Mandatory matrices green: SSRF/rebind/isolation (R4), workspace isolation + forged/expired/anonymous denial + quota + redaction (R2/R6), no-model egress gate (strict, 26 hosts). Graft/Jev/OCR/PStack gates hold on every grain; `.ignore` preserved untracked; no secrets in tree (hygiene PASS, 954+ files).

## 9. Dependency findings
`pnpm audit`: 1 remaining advisory under accepted risk (braces 3.0.3 via Next.js lint chain, no upstream patch, revisit trigger); postcss family closed via the `8.5.30` override. Python CI deps hash-pinned (`requirements-ci.txt`). CycloneDX SBOM: 380 components, freshness-enforced (`generate_sbom.py --check` PASS). Scan record: `docs/qualification/DEPENDENCY_SCAN.md`.

## 10. Artifact hashes
No release digest is published by this record. Digests MUST be generated on the exact RC commit at signing time (`build_release_candidate.mjs --out … --version v1.0.0-local-rc.1`, then `sha256sum -c`). Reference probe at `0198c4b` (procedure demonstration only, superseded tree): 962 files, 1,134,573 bytes, exit 0. Never reuse a digest across commits.

## 11. Signing state
Candidate is explicitly UNSIGNED (`signed: false` in every manifest). The ceremony workflow is verified (`--self-test` → `verified: true`, ephemeral keys, cleanup). Production identity awaits the owner ceremony OD-02. No artifact may be presented as officially signed.

## 12. Issue #62 disposition
`ISSUE_62_CLOSEOUT_REPORT.md` is complete (AC-00 substantially complete; AC-01/AC-02 KEEP; AC-03 genuine-binary qualified; AC-04 dispositioned; gates hold; journeys graded; deferrals/limitations/rights recorded). The issue itself is OPEN: closing requires OD-03.

## 13. Required owner approvals (exact, exhaustive)
- OD-01: v1 Local as replay-only (or approve a consent-UX design to build).
- OD-02: production signing ceremony (else the candidate stays unsigned).
- OD-03: (a) close #62 on the report's evidence+caveats or name additional proof; (b) approve `v1.0.0-local-rc.1` + authorize the release-candidate tag/draft; no final publication without this.
- OD-04: formal commercial terms if a paid offer is ever made (non-blocking for free Local).
- OD-05: choose the Skelet license + authorize root LICENSE + consolidated NOTICE (blocks final release packaging, not RC prep).

## 14. Cloud/Commercial deferrals
`CLOUD_COMMERCIAL_BACKLOG.md` CB-01–CB-19 with entry triggers; nothing deferred is counted complete; no paid provisioning without owner permission; managed SaaS not offered.

## 15. Final recommendation: CONDITIONAL GO
**CONDITIONAL GO**: the v1 Local release candidate is engineering-complete and honestly scoped — it may be tagged as `v1.0.0-local-rc.1` (draft, unsigned) once OD-03 is recorded, with OD-01/OD-02/OD-05 tracked as explicit release notes caveats. It is NOT a GO for a signed, licensed final release: that requires OD-02 (signing) + OD-05 (license/NOTICE) plus regenerated digests on the tagged commit. It is NOT a claim on the original roadmap: that coverage stays 14/25 VERIFIED = 56.0%.
