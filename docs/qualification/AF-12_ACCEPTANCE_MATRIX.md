# AF-12 Acceptance Matrix — P00–P15 / R0–R7

Status: RECONCILED AUDIT RECORD on `skelet/af12-matrix-reconcile-2`. Base: `068956e` (PR #128 merge, CI `38722581990` SUCCESS 15/15).

Review-stack superseding note (2026-10-21, `GD-2026-10-21-REVIEW-STACK`): the mandatory TypeSafe
Jev gate was waived by founder decision. The forward-looking gate statements this decision
edits now name the PStack review panel, and the R7 evidence inventory is forward-looking
and names the records new grains produce. The historical `docs/reviews/*_JEV_REVIEW.*`
files remain on disk and are preserved as evidence of what ran at the time. Every
*historical* per-pull-request entry below is preserved verbatim; its Jev mentions are
historical statements and are not to be read as a current gate or rewritten.
Method: each row cites live implementation, committed tests, reproducible commands, and evidence. No invented evidence. A passing unit test alone does not verify an integrated feature. Missing functionality is never NOT APPLICABLE without an authoritative reason. Rows below remain the audit of `543641a` except where Post-Audit Deltas (now current through PR #128) supersede them; the delta log is the reconcilement record.
Frontier revalidated 2026-10-15:
- HEAD `068956e`, origin/main identical, branch `skelet/af12-matrix-reconcile-2` clean except untracked `.ignore`.
- Issues: #34 OPEN (execution tracker), #62 OPEN (ArtCraft), #9 CLOSED (Build Kit).
- PRs #1–#128 all MERGED, zero open PRs at time of writing.
- CI jobs (15): bootstrap, graft, no-model, web, worker, monet-screenshot-queue, providers, editor-adapters, ingest, assets, sdk, lens, db-foundation, storage-ubuntu-24.04, storage-windows-latest.
- MCP tool inventory: 30 (24 at PR #119 plus list_patterns/get_pattern plus four replay verbs).

Requirement sources:
- `docs/IMPLEMENTATION_PLAN.md` sections 14 (P00–P15), 8.1/15 (P09b), 21 (security matrix), 13 (CI gates).
- `docs/architecture/AGENT_FIRST_ZERO_FOUNDER_COST_BLUEPRINT_2026-10-11.md` section 10 for R0–R7 readiness dimensions and AF-00–AF-12 grain mapping (canonical after PR #63).
- `PRODUCT.md`, `ARCHITECTURE.md`, `SECURITY.md`, `GOVERNANCE.md`, `docs/operations/PLAN_GAP_REGISTER_2026-10-08.md`.
- `docs/qualification/ISSUE_9_MATRIX.md` for P09b closeout scope.
- Issue #62 for ArtCraft AC-00–AC-04 and global gates.

R-gate definitions (authoritative per AF-00 blueprint section 10):
- R0 provenance — immutable source pins, code/data/asset/model/trademark separation, per-item rights.
- R1 runnable shell — clean install, lint/typecheck/build, health/smoke from one checkout.
- R2 tenant/domain/storage — workspace auth, actor-scoped reads, content-addressed storage, idempotent domain.
- R3 S0 end-to-end — rights-cleared fixture to search to inspect to save to pack to second-client recovery, no model.
- R4 guarded Lens — fail-closed URL intake, isolated capture, deterministic report, no mandatory LLM.
- R5 qualified corpus/search and agent interoperability — corpus usable offline, lexical baseline measured, versioned agent contract with 3 clients.
- R6 local/paid beta security plus operations — quotas, rate limits, billing lifecycle, backup/restore, takedown purge, abuse controls.
- R7 release correctness — signed release artifacts, SBOM/scans, migration rehearsal, SLOs/alerts, load proof, docs.

Column key per row: (1) ID, (2) acceptance criterion (abridged with source section), (3) implementation reference, (4) test reference, (5) verification command, (6) evidence commit/CI, (7) security/rights, (8) status, (9) remaining gap, (10) next action.

---

## P00 — Governance and Upstream Lock (plan section 14)

1. ID: P00.
2. Acceptance: PRODUCT/ARCHITECTURE/SECURITY/GOVERNANCE canonical; UPSTREAMS.lock.yml schema with role/permission/license placeholders and execution-time pin rule; CODE/DATA_PROVENANCE; CI skeleton and branch governance; no runtime donor code imported yet.
3. Implementation: `PRODUCT.md`, `ARCHITECTURE.md`, `SECURITY.md`, `GOVERNANCE.md`, `CODE_PROVENANCE.md`, `DATA_PROVENANCE.md`, `schemas/upstreams.schema.json`, `UPSTREAMS.lock.yml`, `docs/operations/CI.md`, `.github/workflows/ci.yml`.
4. Tests: `tests/test_validate_upstreams.py`, `tests/test_ci_hygiene.py`, `scripts/validate_upstreams.py`, `scripts/ci_hygiene.py`.
5. Verify: `python -m unittest discover -s tests -v`; `python scripts/validate_upstreams.py`; `python scripts/ci_hygiene.py --expected-head $(git rev-parse HEAD)`.
6. Evidence: PRs #1 (G00-01), #2 (G00-02), #3 (G00-03), #8 (G00-04), #10 (G00-05); post-merge main CI SUCCESS chain; HEAD `543641a` CI `38502030267` SUCCESS 15/15.
7. Security/rights: pins are immutable commits, not branch names; code vs data/asset/model/trademark scopes separated in lock; CI hygiene rejects secrets/binary corpus abuse.
8. Status: VERIFIED.
9. Gap: none for P00 scope.
10. Next: none; preserve as canonical.

## P01 — Monet Selective Baseline Import (plan section 14)

1. ID: P01.
2. Acceptance: live Monet pin verified; import manifest before copying; only required source/config/scripts/tests; bulk media/branding/deployment/secrets excluded; notices preserved; Skelet identity without blind third-party rewrite; install/lint/typecheck/tests/build qualified.
3. Implementation: `imports/monet-registry/`, `scripts/audit_monet_code.py`, `docs/provenance/MONET_*.md`, `apps/web` Skelet-owned shell, `packages/*` workspace layout, `UPSTREAMS.lock.yml` id `monet-registry` pin `85c966f8d94572431bcbb4439f9fd7ea2a893321`.
4. Tests: `tests/test_monet_import_manifest.py`, `tests/test_audit_monet_code.py`, `tests/test_monet_dependency_closure.py`, `tests/test_monet_queue_import.py`, web/worker lint/typecheck/build/smoke.
5. Verify: `python -m unittest discover -s tests`; `pnpm install --frozen-lockfile`; `pnpm --dir apps/web lint && pnpm --dir apps/web typecheck && pnpm --dir apps/web build`; `node scripts/smoke-web.mjs 3103`.
6. Evidence: PRs #4 (G01-01), #5 (G01-01a), #6 (G01-02a), #7 (G01-02b), #11 (G01-02c), #12 (G01-03a), #13 (G01-03b); plan hardening section 23 records non-runnable-Monet correction and Skelet-owned shell decision; HEAD CI SUCCESS.
7. Security/rights: quarantine decisions recorded; dependency closure reviewed; no donor secrets/branding activated; license inventory in provenance docs.
8. Status: VERIFIED (under hardened interpretation: Skelet-owned shell plus one dependency-closed qualified capability, not full Monet product parity).
9. Gap: none blocking; donor parity beyond qualified modules is explicitly out of scope.
10. Next: none for P01.

## P02 — Repository Reshape and Local Dev Stack (plan section 14)

1. ID: P02.
2. Acceptance: pnpm workspace layout; apps/web and apps/worker; packages/domain/db/storage/provenance/providers/testkit (as implemented); local PostgreSQL dev config and filesystem storage adapter; environment schema/validation; no intended behavior change; web and worker run independently; clean reset/bootstrap documented and tested.
3. Implementation: `pnpm-workspace.yaml`, `apps/web/`, `apps/worker/`, `packages/db`, `packages/storage`, `packages/providers`, `packages/ingest`, `apps/worker` env/health contract.
4. Tests: `apps/worker/tests/env.test.mjs`, `apps/worker/tests/cli.test.mjs`, `apps/web/tests/health-route.test.mjs`, `packages/storage/tests/storage.test.mjs`, `packages/db/tests/db-foundation.test.mjs`.
5. Verify: `pnpm install --frozen-lockfile`; `pnpm --dir apps/web build`; `pnpm --dir apps/worker start health`; `node --experimental-strip-types --test apps/worker/tests/*.test.mjs`.
6. Evidence: PR #14 (G02-02 worker shell and env contract) plus reshape history via G02-01 move; HEAD CI `web`, `worker`, `storage`, `db-foundation` jobs SUCCESS.
7. Security/rights: env schema rejects unknown secrets; worker health proves no business jobs yet at that grain; storage stays local-first.
8. Status: VERIFIED.
9. Gap: none.
10. Next: none.

## P03 — Canonical Domain plus Persistence (plan section 14)

1. ID: P03.
2. Acceptance: migrations for Source/Product/ProductVersion/Artifact/Asset/Relation/Flow/FlowStep/Pattern/Collection/CaptureRun/AnalysisRun/ImportRecord; content-addressed asset service; repository/service layer; source/external-ID idempotency; deterministic fixtures; CRUD/relation traversal pass; duplicate import is no-op; provenance mandatory for published imports.
3. Implementation: `packages/db/src/db.ts`, `migrate.ts`, `graph.ts`, `repositories.ts`, `workflows.ts`, `jobs.ts`, `idempotency.ts`, `artifact-access.ts`, `packages/storage/src/*` SHA-256 dedupe.
4. Tests: `packages/db/tests/db-foundation.test.mjs`, `graph.test.mjs`, `workflows.test.mjs`, `artifact-access.test.mjs`, `packages/storage/tests/storage.test.mjs`, `packages/ingest/tests/publish.test.mjs`, PG suites `pg-integration/pg-graph/pg-workflows/pg-build-kit` (14 tests on real PostgreSQL).
5. Verify: `node --experimental-strip-types --test packages/db/tests/db-foundation.test.mjs packages/db/tests/graph.test.mjs packages/db/tests/workflows.test.mjs packages/db/tests/artifact-access.test.mjs`; `node --experimental-strip-types --test packages/storage/tests/storage.test.mjs`; real PG with `SKELET_TEST_DATABASE_URL=postgresql://skelet_test:local_ci_fixture_only@127.0.0.1:5432/skelet_test SKELET_DB_TEST_CONFIRM=yes node --experimental-strip-types --test packages/db/tests/pg-*.test.mjs`.
6. Evidence: PRs #16 (G03-01), #18 (G03-02), #20 (G03-03), #22 (G03-04); AF-12 qualification records DB non-PG 99/99, PG 14/14, storage 11/11; HEAD CI `db-foundation` SUCCESS.
7. Security/rights: FK constraints, content hashes, idempotency keys, actor-scoped access gate (see AF-SEC-00); no public asset serving without policy.
8. Status: VERIFIED.
9. Gap: none for P03 tables; typed extension tables remain future-only per plan and are not required.
10. Next: none.

## P04 — Auth, Workspaces, Billing Skeleton (plan section 14)

1. ID: P04.
2. Acceptance: auth integration; workspace/organization roles; collections and saved references; Stripe plugin behind feature/config gate; Free/Pro/Team capability model without hard-coded prices; signup/signin, workspace create/join, collection save; cross-workspace isolation; webhooks signature-verified and replay-safe.
3. Implementation: `packages/db/src/auth.ts`, `workspaces.ts`, `collections.ts`, `billing.ts`, `apps/web/lib/boards.ts`, `apps/web/app/api/v1/boards/*`, collection save-reference path.
4. Tests: `packages/db/tests/auth.test.mjs`, `workspaces.test.mjs`, `collections.test.mjs`, `billing.test.mjs`, `apps/web/tests/boards.test.mjs`, `mcp-boards.test.mjs`, `boards-ui.test.mjs`.
5. Verify: `node --experimental-strip-types --test packages/db/tests/auth.test.mjs packages/db/tests/workspaces.test.mjs packages/db/tests/collections.test.mjs packages/db/tests/billing.test.mjs`; `node --experimental-strip-types --test apps/web/tests/boards.test.mjs`.
6. Evidence: PRs #23 (G04-01), #24 (G04-02), #25 (G04-03), #26 (G04-04); AF-SEC-00 (PR #66) centralizes actor checks; HEAD CI `db-foundation`/`web` SUCCESS.
7. Security/rights: server-side membership/role checks; forged IDs denied; expired sessions fail closed; billing state never trusts client plan fields; plan prices remain configuration.
8. Status: VERIFIED (skeleton scope; production price catalog and hosted billing operations are P15, not P04).
9. Gap: production webhook live-money proof and plan enforcement at commercial scale remain P15.
10. Next: cover commercial billing enforcement in P15 grain; no P04 reopen.

## P05 — Ingestion Framework plus Jobs (plan section 14)

1. ID: P05.
2. Acceptance: provider interface/registry; PostgreSQL-backed queue; CaptureRun/AnalysisRun lifecycle and retries; dry-run, dead-letter, cancellation, concurrency limits; object-store upload/dedupe; fixture source end-to-end through queue to graph to store to publish; re-import idempotent; failed enrichment never partially publishes.
3. Implementation: `packages/db/src/jobs.ts`, `packages/db/src/build-kit.ts`, `packages/providers/src/*`, `packages/ingest/src/*`, `packages/lens/src/capture-worker.ts`, `capture-scope.ts`, `capture-traversal.ts`.
4. Tests: `packages/db/tests/jobs.test.mjs`, `build-kit.test.mjs`, `packages/providers/tests/provider.test.mjs`, `packages/ingest/tests/publish.test.mjs`, `packages/lens/tests/capture-scope.test.mjs`, `capture-traversal.test.mjs`, `kit-fixture-chain.test.mjs`.
5. Verify: `node --experimental-strip-types --test packages/db/tests/jobs.test.mjs packages/db/tests/build-kit.test.mjs packages/providers/tests/provider.test.mjs packages/ingest/tests/publish.test.mjs`.
6. Evidence: PRs #27 (G05-01), #28 (G05-02), #29 (G05-03); AF-05a–g chain (PRs #73–#79) exercises queue lifecycle with cancel/retry/resume/expiry/quota; HEAD CI `providers`, `ingest`, `lens`, `db-foundation` SUCCESS.
7. Security/rights: timeout/cancel/health/provenance/egress-cost on every provider; isolated capture worker has no prod secrets; publish is terminal only after validators.
8. Status: VERIFIED.
9. Gap: none for framework; individual corpus adapters are P06/P10 scope.
10. Next: none.

## P06 — Assets v1 (plan section 14)

1. ID: P06.
2. Acceptance: Iconify-compatible importer/search; Simple Icons/SVGL-authorized logo ingestion; Fontsource metadata ingestion; OpenBrand adapter; unified Assets UI/API; rights/license/trademark filters; one query returns icons/logos/fonts on shared contract; every downloadable has provenance and serving policy; MCP/API resolves SVG/font metadata without web scraping.
3. Implementation: `packages/assets/src/*` (`registry.ts`, iconset, brandfont), `packages/providers` OpenBrand path, `apps/web/app/api/v1/assets/*`, `apps/web/lib/mcp.ts` `search_assets`/`get_asset`, `skills/skelet-assets/SKILL.md`.
4. Tests: `packages/assets/tests/assets.test.mjs`, `iconset.test.mjs`, `brandfont.test.mjs`, `search.test.mjs`, `apps/web/tests/search.test.mjs`, rights-denial cases in `kit-fixture-chain`, `export-surface`, AF-03b parity.
5. Verify: `node --experimental-strip-types --test packages/assets/tests/assets.test.mjs packages/assets/tests/iconset.test.mjs packages/assets/tests/brandfont.test.mjs`; `python scripts/validate_registry.py`; `python scripts/validate_skills.py`.
6. Evidence: PRs #30 (G06-01), #31 (G06-02), #32 (G06-03); AF-12 record assets 13/13; HEAD CI `assets` SUCCESS.
7. Security/rights: per-item serving matrix; trademark state explicit; disallowed bytes withheld; metadata-only/link-only enforced; notices preserved.
8. Status: VERIFIED (within no-model/local scope; hosted font-file redistribution remains rights-gated by design).
9. Gap: none blocking; broader logo/font corpus expansion is data work, not a missing framework.
10. Next: none.

## P07 — Component Registry (plan section 14)

1. ID: P07.
2. Acceptance: shadcn-compatible endpoint and index; Monet/OpenSourceUI/PaceUI adapters for permitted components only; dependency/provenance metadata and live preview; contract tests; shadcn MCP discovers items without Skelet plugin; clean sample app installs a qualified component and builds.
3. Implementation: `apps/web/app/api/registry/route.ts`, `apps/web/app/api/registry/[name]/route.ts`, `packages/assets/src/registry.ts`, `scripts/validate_registry.py`, `scripts/prove_registry_install.mjs`.
4. Tests: `apps/web/tests/registry.test.mjs`, `scripts/validate_registry.py` (2 items), `scripts/prove_registry_install.mjs` (`skelet-button`, `skelet-card`), AF-05 R1 consumer smoke `scripts/prove_starter_consumer.mjs`.
5. Verify: `python scripts/validate_registry.py`; `node scripts/prove_registry_install.mjs`; `node --experimental-strip-types --test apps/web/tests/registry.test.mjs`.
6. Evidence: PRs #33 (G07-01), #35 (G07-02); AF-05-closeout (PR #80) plus AF-05-R1 (PR #81) close R1; HEAD CI `web` SUCCESS (registry validation plus install proof run in `web` job).
7. Security/rights: only permitted components normalized; dependencies and provenance required; generated registry validated in CI.
8. Status: VERIFIED.
9. Gap: none for launch contract; additional component corpus is data expansion.
10. Next: none.

## P08 — Agent Platform v1 (plan sections 9/14)

1. ID: P08.
2. Acceptance (literal plan): Remote MCP Streamable HTTP; stable `skelet://` URIs; launch tools search_design/get_object/find_similar/compare_design/analyze_url/analyze_image/resolve_asset/save_reference/create_reference_pack/get_changes/search_registry; skills for research/assets/lens/reference-pack; REST v1 parity; 3 independent MCP clients; agent search-inspect-save-pack end-to-end; schema snapshots.
3. Implementation: `apps/web/app/api/mcp/route.ts`, `apps/web/lib/mcp.ts` (actual tools: `search_assets`, `get_asset`, `get_registry_item`, `search_registry`, `find_similar`, `compare_design`, `list_flows`, `get_flow_steps`, `get_changes`, `list_products`, `list_product_versions`, `list_patterns`, `get_pattern`, `replay_open_session`, `replay_record_events`, `replay_close_session`, `replay_get_events`, `save_reference`, `create_reference_pack`, `get_object`, 7 `lens_*`, 3 `board_*`; 30 tools), `apps/web/lib/agent-contract.ts`, `apps/web/lib/rest.ts` (incl. `getChangesRoute`, `listProductsRoute`, `listProductVersionsRoute`, `listPatternsRoute`, `getPatternRoute`, replay session routes, `findSimilarRoute`, `compareArtifactsRoute`, `searchRegistryRoute`), REST routes incl. `/api/v1/changes`, `/api/v1/products`, `/api/v1/products/{id}/versions`, `/api/v1/patterns`, `/api/v1/patterns/{slug}`, `/api/v1/replays`, `/api/v1/replays/{id}/events`, `/api/v1/replays/{id}/close`, `packages/sdk-ts`, `scripts/skelet_sdk.py`, `scripts/skelet.py`, `scripts/mcp_stdio.mjs`, skills (research step 9 replay; `get_changes` + gallery + patterns + replay promoted), `schemas/agent-contract.schema.json`.
4. Tests: `apps/web/tests/mcp.test.mjs` (24-tool inventory), `envelope-parity.test.mjs`, `interop-http.test.mjs`, `interop-stdio.test.mjs`, `rest.test.mjs`, `search.test.mjs`, `similar.test.mjs`, `compare.test.mjs`, `flows.test.mjs`, `changes.test.mjs`, `gallery.test.mjs`, `golden-journey.test.mjs`, `mcp-lens.test.mjs`, `mcp-boards.test.mjs`, `packages/sdk-ts/tests/client.test.mjs`, `tests/test_validate_agent_contract.py`, `tests/test_validate_skills.py`, `tests/test_mcp_interop_py.py`, `tests/test_skelet_sdk.py`.
5. Verify: `node --experimental-strip-types --test tests/node/*.test.mjs apps/web/tests/*.test.mjs` (web job subset); `python scripts/validate_agent_contract.py`; `python scripts/validate_skills.py`; `node --experimental-strip-types --test packages/sdk-ts/tests/client.test.mjs`; `python -m unittest discover -s tests`.
6. Evidence: PRs #36 (G08-01), #37 (G08-02), #38 (G08-03), #39 (G08-04), #40 (G08-05), #41 (G08-06); AF-03a (PR #69), AF-03b (PR #70), AF-03c (PR #71, three wire clients: Node fetch HTTP, Python urllib HTTP, Node stdio pipes, plus TS/Python SDK envelope tests and migration 011 ledger); AF-SEC-00 (PR #66) actor scoping; AF-13a-i/ii (PRs #93/#94), AF-13b-i (PR #103), AF-13b/AF-14c coverage (PRs #104/#105), AF-15a (PR #106), AF-14a flows (PR #98), AF-14b-i kinds (PR #107), AF-14c gate fix (PR #117), AF-14d gallery (PR #118), R3 journey (PR #113); HEAD CI `web`, `sdk`, `bootstrap` SUCCESS.
7. Security/rights: bearer-gated asset tools; session-bound write identities; workspace denial parity; revoked/expired denial; rate/quota; secret redaction; error taxonomy without stack/secret leak (`FORBIDDEN_OR_NOT_FOUND` opaque); AF-14c similarity-gate fix included.
8. Status: PARTIAL.
9. Gap: remaining canonical gaps versus literal plan: no first-class `search_design` (implemented as `search_assets`), no single-shot `analyze_url`/`analyze_image` (durable `lens_*` jobs; skill gates single-shot as later), `resolve_asset` covered by `get_asset`/`get_object` (AF-13b record), no MCP Apps SDK views (P12 Apps disposition: deferred as progressive enhancement). Interop is evidenced for implemented tools, not for missing tools.
10. Next: single-shot analysis only with a qualified synchronous path that preserves the job pipeline guarantees; Apps views only with SDK plus hosts plus measured need. Do not rename working tools gratuitously.

## P09 — Lens v1 (plan sections 8/14)

1. ID: P09.
2. Acceptance: safe URL intake/SSRF controls; isolated Playwright capture worker; Dembrandt/OpenBrand/OpenTechAlyzer adapters; optional Squirrelscan; Design DNA projection and exports; public URL to reproducible report with screenshot/DOM/sections/colors/type/spacing/logos/assets/tech/provenance/agent export; hostile/private URLs fail closed; no external LLM on qualified path.
3. Implementation: `packages/lens/src/url-guard.ts`, `capture-network.ts`, `capture-child.ts`, `capture-worker.ts`, `design-tokens.ts`, `style-evidence.ts`, `tech-signal-evidence.ts`, `tech-clue-matcher.ts`, `report-assembly.ts`, `export-surface.ts`, `analyze-url.ts`, `apps/web/app/api/v1/lens/jobs/*`, `apps/web/app/lens/page.tsx`, `UPSTREAMS.lock.yml` Dembrandt/OpenBrand/OpenTechAlyzer/Squirrelscan pins with `docs/provenance/*EVALUATION*`.
4. Tests: `url-guard.test.mjs`, `capture-network.test.mjs`, `capture-browser.test.mjs` (real Chromium), `design-tokens.test.mjs`, `style-evidence.test.mjs`, `tech-signal-evidence.test.mjs`, `tech-clue-matcher.test.mjs`, `analyze-url.test.mjs`, `report-assembly.test.mjs`, `export-surface.test.mjs`, `lens-jobs.test.mjs`, `lens-recovery.test.mjs`, `lens-ui.test.mjs`, `mcp-lens.test.mjs`, `no-paid-path.test.mjs`.
5. Verify: `node --experimental-strip-types --test packages/lens/tests/url-guard.test.mjs packages/lens/tests/design-tokens.test.mjs packages/lens/tests/capture-network.test.mjs packages/lens/tests/capture-browser.test.mjs packages/lens/tests/report-assembly.test.mjs packages/lens/tests/style-evidence.test.mjs packages/lens/tests/export-surface.test.mjs packages/lens/tests/tech-signal-evidence.test.mjs packages/lens/tests/tech-clue-matcher.test.mjs packages/lens/tests/analyze-url.test.mjs`; lens job `prove_starter_consumer` runs in CI lens job.
6. Evidence: PRs #42–#56 (G09-01–G09-13); AF-05e (PR #77) REST/MCP/UI parity; AF-05g-i (PR #79) no-paid-path guard; `docs/qualification/NO_MODEL_BUILD_KIT.md`; AF-12 record lens 197/197 including real Chromium; HEAD CI `lens` SUCCESS.
7. Security/rights: SSRF/DNS/redirect/rebinding/scheme/size/loop/timeout/SVG-isolation/secret-free-worker matrix; prompt-injection hostile content stays data; per-item rights withheld from exports.
8. Status: VERIFIED (qualified deterministic path; donor adapters explicitly evaluation-first, not runtime-imported, per ISSUE_9_MATRIX criterion 7).
9. Gap: single-shot `analyze_url`/`analyze_image` MCP verbs remain job-based by design; no gap versus qualified Lens report contract.
10. Next: none for P09; build on it for P09b/P10.

## P09b — Lens Build Kit (plan sections 8.1/15, Issue #9)

1. ID: P09b.
2. Acceptance: versioned schemas and fixture-validated ZIP layout; AnalysisRun/kit lifecycle queued to canceled with idempotent create/poll/cancel/retry/resume/expiry/tenant scope/quota; UI/REST/MCP/CLI-SDK parity over stable IDs and `skelet://lens/{id}`; 3-page fixture with desktop/mobile captures, deterministic tokens, inventory, source-linked evidence, schema-valid ZIP, starter that installs/typechecks/builds/starts and passes responsive/keyboard smoke; rights firewall; SSRF/injection/traversal/quota/cancel/outage tests; no paid inference and no P14 dependency.
3. Implementation: `packages/lens/src/kit-manifest.ts`, `kit-package.ts`, `starter-synthesis.ts`, `capture-scope.ts`, `capture-traversal.ts`, `report-assembly.ts`, `packages/db/src/build-kit.ts`, `apps/web/app/api/v1/lens/jobs/*`, `apps/web/app/lens/page.tsx`, `schemas/lens-build-kit.schema.json`, `scripts/prove_starter_consumer.mjs`, `scripts/prove_registry_install.mjs`.
4. Tests: `three-page-fixture.test.mjs`, `kit-fixture-chain.test.mjs`, `kit-manifest.test.mjs`, `kit-package.test.mjs`, `starter-synthesis.test.mjs`, `lens-jobs.test.mjs`, `lens-recovery.test.mjs`, `lens-ui.test.mjs`, `mcp-lens.test.mjs`, `no-paid-path.test.mjs`, PG `pg-build-kit.test.mjs`.
5. Verify: `node --experimental-strip-types --test packages/lens/tests/three-page-fixture.test.mjs packages/lens/tests/kit-fixture-chain.test.mjs`; `python scripts/validate_build_kit.py`; `node scripts/prove_starter_consumer.mjs --port=3127`; PG kit suite with real PostgreSQL.
6. Evidence: PRs #57–#61, #63–#65 (G09b-01–07), #73–#81 (AF-05a–g, R1, closeout); `docs/qualification/ISSUE_9_MATRIX.md` 8/8 VERIFIED; `docs/qualification/NO_MODEL_BUILD_KIT.md`; post-merge CIs SUCCESS; HEAD CI `lens` plus `db-foundation` SUCCESS.
7. Security/rights: unknown/trademark/restricted bytes withheld; ZIP traversal/CRC/method guarded; tenant denial and quota exhaustion/release; idempotent replay without double charge; PROVIDER_DISABLED parity.
8. Status: VERIFIED (with recorded scope qualifier: CLI/SDK lens operations do not exist; agents served via MCP/REST plus skill; SDK lens is NOT APPLICABLE per matrix criterion 3 where-available clause).
9. Gap: none for launch-critical kit journey.
10. Next: none; preserve contract.

## P10 — Research Corpus plus Flows (plan section 14)

1. ID: P10.
2. Acceptance (literal): authorized app/site/screen/flow import adapters; Mobbin-learned screen/flow/hotspot normalization without Mobbin runtime dependency; product/version UI, screen gallery, flow player, pattern taxonomy; rrweb for newly captured web flows; imported screens/flows coexist with pages/components/assets in one graph; flow steps reference screenshots/hotspots/actions/replay; corpus usable with all donor endpoints disabled.
3. Implementation: `packages/db/src/workflows.ts` (Flow/FlowStep CRUD), `packages/db/src/gallery.ts` (`listProductsForActor`/`listProductVersionsForActor`: visible-only products/versions, no-oracle empty lists, deterministic orders, truncation flags), `packages/db/src/patterns.ts` (`listPatternsForActor`/`getPatternForActor` with taxonomy validation and relation-linked visibility), `packages/db/src/replay.ts` (consented replay sessions with redaction, budgets, ordering), `packages/db/migrations/017_replay_sessions.*`, `packages/ingest/src/corpus.ts` (validate-first ledger-idempotent importer), `packages/lens/src/video-frame-evidence.ts`, `jpeg-evidence.ts`, `packages/lens/src/capture-traversal.ts`, `imports/craft-suite/manifest.json` (AC-00 planning only), gallery/pattern/replay MCP tools plus REST routes (`list_products`, `list_product_versions`, `list_patterns`, `get_pattern`, replay session verbs, `/api/v1/products`, `/api/v1/products/{id}/versions`, `/api/v1/patterns`, `/api/v1/patterns/{slug}`, `/api/v1/replays`, `/api/v1/replays/{id}/events`, `/api/v1/replays/{id}/close`), UI pages `/gallery`, `/flows` (with replay playback), `/patterns`.
4. Tests: `packages/db/tests/workflows.test.mjs`, `pg-workflows.test.mjs`, `packages/db/tests/gallery.test.mjs` (6 tests: counts/visibility/pagination/validation/isolation/journey-feed), `packages/db/tests/patterns.test.mjs` (6 tests: validation/ordering/invisibility/detail/query/isolation), `packages/db/tests/replay.test.mjs` (7 tests: consent/mask/redaction/malformed/close/budget/outsiders), `apps/web/tests/gallery.test.mjs` (3 transport tests incl. parity and no-oracle), `apps/web/tests/gallery-ui.test.mjs` (6 source tests), `apps/web/tests/flows.test.mjs`, `apps/web/tests/flows-ui.test.mjs` (6 source tests incl. replay playback), `apps/web/tests/patterns.test.mjs` (3 transport tests), `apps/web/tests/patterns-ui.test.mjs` (5 source tests), `apps/web/tests/replay.test.mjs` (2 transport tests incl. lifecycle parity), `packages/ingest/tests/corpus.test.mjs` (6 tests), `packages/lens/tests/video-frame-evidence.test.mjs`, `video-evidence-attachment.test.mjs`, `capture-traversal.test.mjs`, `three-page-fixture.test.mjs`.
5. Verify: `node --experimental-strip-types --test packages/db/tests/workflows.test.mjs packages/db/tests/gallery.test.mjs packages/db/tests/patterns.test.mjs packages/db/tests/replay.test.mjs packages/lens/tests/video-frame-evidence.test.mjs packages/lens/tests/video-evidence-attachment.test.mjs`.
6. Evidence: AF-06-i (PR #82) bounded video-frame evidence; AF-06-ii (PR #83) video-evidence attachment with re-auth; AF-14a (PR #98) authorized corpus importer with migration 016 plus `list_flows`/`get_flow_steps` (inventory 18->20); AF-14d (PR #118) product/version gallery reads (inventory 22->24); AC-01 KEEP decision (PR #109) for the frame path; PR #122 gallery UI (`/gallery` over qualified reads with cursor-nest fix); PR #123 flow player (`/flows` inspection/playback); PR #124 taxonomy reads (`list_patterns`/`get_pattern`, inventory 24->26, no migration); PR #125 taxonomy UI (`/patterns`); PR #126 replay ledger (migration 017, redaction, budgets, with migration-list fix); PR #127 replay transport (four session verbs, inventory 26->30); PR #128 replay playback (flow-player replay section). No merged PR implements Mobbin normalization, screen gallery UI, or live rrweb capture.
7. Security/rights: video frames carry source hash/timestamps/settings/rights and no-fabricated-interaction flag; workspace/rights isolation tested; gallery/taxonomy lists only readable evidence with unknown/withheld reading as empty (no oracle); replay sessions bind the opening actor and re-check readability on record and replay with outsider nulls; sensitive input values masked pre-storage.
8. Status: PARTIAL.
9. Gap: no live rrweb capture client, no Mobbin normalization, no screen gallery UI beyond the product/version gallery; replay opening/recording stays agent-side.
10. Next: live capture disposition (client recorder with consent UX plus redaction proof, or an authorized deferral with triggers); Mobbin normalization note; then P15 hardening.

## P11 — Multimodal Search plus Similarity (plan section 14)

1. ID: P11.
2. Acceptance (literal): unified SearchDocument projection; PostgreSQL FTS plus pgvector; local text/visual embedding worker with pinned open model (e.g. SigLIP2); hybrid ranking and typed filters; text-to-any, image-to-similar, artifact-to-similar; relevance benchmark fixture with thresholds.
3. Implementation: `packages/assets/src/registry.ts` deterministic lexical search, `packages/assets/src/similarity.ts` (`SIMILARITY_KINDS` spans all 11 `ARTIFACT_KINDS`; AF-SEC-00-mirroring candidate predicate per AF-14c fix), `packages/assets/tests/search.test.mjs`, `packages/assets/tests/fixtures/search-relevance.json`, `scripts/bench_search.mjs`, `scripts/bench_board_changes.mjs` (flows/steps/changes/similar latencies), `apps/web/app/api/v1/assets/route.ts`, `apps/web/lib/mcp.ts` `search_assets`/`find_similar`, `apps/web/tests/search.test.mjs`, `similarity.test.mjs`, `similar.test.mjs`. No `packages/search`, no pgvector migration, no embedding worker, no visual index.
4. Tests: `packages/assets/tests/search.test.mjs`, `similarity.test.mjs` (11 tests incl. screens baseline and gate regression), `apps/web/tests/search.test.mjs`, `similar.test.mjs` (5 tests incl. screens parity and gate regression), `envelope-parity.test.mjs` search cases, `bench_search.mjs` baseline, `P11_SCOPE_DISPOSITION.md` conformance (4 tests).
5. Verify: `node --experimental-strip-types --test packages/assets/tests/search.test.mjs packages/assets/tests/similarity.test.mjs`; `node --experimental-strip-types --test apps/web/tests/search.test.mjs apps/web/tests/similar.test.mjs`; `node scripts/bench_search.mjs`; `node scripts/bench_board_changes.mjs`.
6. Evidence: AF-04 (PR #72) deterministic lexical search with PostgreSQL FTS; AF-13a-i/ii (PRs #93/#94) similar/compare; AF-14b-i (PR #107) all-kinds similarity; AF-14c (PR #117) gate fix; `P11_SCOPE_DISPOSITION.md` (PR #116); plan section 24.2 plus blueprint reclassify pgvector/local embeddings as future opt-in, not mandatory for no-model core; HEAD CI `assets`/`web` SUCCESS.
7. Security/rights: rights/visibility filter before rank/facets/suggestions/caching (central-gate-mirroring candidate predicate since AF-14c); tenant denial in search/similarity tests; no vector store to leak across workspaces.
8. Status: PARTIAL (VERIFIED only for the revised no-model lexical baseline; NOT VERIFIED for literal multimodal pgvector/SigLIP2 similarity).
9. Gap: no text embedding, no visual embedding, no image-to-similar query path, no hybrid ranker, no optional embedding plugin; frozen relevance set is synthetic, not human-judged at the scale the literal plan requires. Must never label lexical/perceptual aids as semantic embeddings.
10. Next: embedding plugin only on measured lexical inadequacy (pinned model/rights/perf/CPU acceptance, opt-in install, deterministic fallback); hybrid ranker only on benchmark-justified gain. Do not make embeddings launch-blocking.

## P12 — MCP Apps plus Research Memory (plan section 14)

1. ID: P12.
2. Acceptance (literal): MCP App views for gallery, flow player, compare, asset picker, Lens report, reference board; project/reference-pack persistence; evidence compaction format; supported MCP App client renders interactive UI from remote server; second agent recovers every evidence object by URI.
3. Implementation: `apps/web/lib/reference-packs.ts` (`skelet/reference-pack/1`), `apps/web/lib/boards.ts`, `apps/web/app/api/v1/boards/*`, `apps/web/app/boards/page.tsx`, `apps/web/tests/boards*.test.mjs`, `mcp-boards.test.mjs`, `skills/skelet-reference-pack/SKILL.md`. No MCP Apps SDK `ui://` resources; no gallery/flow/compare/picker/report Apps views; no separate compaction format beyond reference-pack export.
4. Tests: `packages/db/tests/collections.test.mjs`, `apps/web/tests/boards.test.mjs`, `boards-ui.test.mjs`, `mcp-boards.test.mjs`, `mcp.test.mjs` pack round-trip, `envelope-parity.test.mjs`, `P12_APPS_DISPOSITION.md` conformance (4 tests).
5. Verify: `node --experimental-strip-types --test apps/web/tests/boards.test.mjs apps/web/tests/mcp-boards.test.mjs`; `python scripts/validate_skills.py`; `python -m unittest tests.test_p12_apps -v`.
6. Evidence: AF-07-i (PR #84) board ranks/move, AF-08-i (PR #85) board REST, AF-08-ii (PR #86) board operator UI, AF-09-i/ii (PRs #87–#88) handoff/ledger and REST/MCP/UI parity, AF-14c coverage (PR #105) pack-read/compaction record, AC-02 KEEP decision (PR #110); `P12_APPS_DISPOSITION.md` (PR #119): qualified core without Apps, `ui://` views deferred with sandbox-conditioned trigger. HEAD CI `web`/`db-foundation` SUCCESS.
7. Security/rights: collection ownership/handoff ledger with item validation; two-workspace denial; tombstones; offline draft behavior covered by board tests; no hosted-media embedding in packs.
8. Status: PARTIAL.
9. Gap: MCP Apps layer missing (no SDK in tree; unsupported methods degrade to -32601 with REST fallback); flow player/compare/gallery/picker/Lens-report Apps views missing; ArtCraft moodboard transplant decided KEEP (Skelet-owned board) per AC-02 with revisit triggers.
10. Next: Apps views only with official SDK plus supporting hosts plus measured journey need (embed via official UI resources with sandbox; existing surfaces stay the fallback).

## P13 — Time Machine plus Change Intelligence (plan section 14)

1. ID: P13.
2. Acceptance: scheduled/explicit recapture policy; page/screenshot/token/text/flow diff pipeline; normalized change events and meaningful-change scoring; watch/`get_changes` API/MCP; two ProductVersions yield evidence-linked change events without model prose; cosmetic versus structural changes distinguishable by deterministic signals plus optional enrichment.
3. Implementation: `packages/db/src/changes.ts` (`getChangesForActor`: ledger-backed identity, tags equality, rights-gated, paginated, deterministic) with `get_changes` MCP tool plus REST `GET /api/v1/changes` (deep-equal parity), skill step, validator promotion; `list_products`/`list_product_versions` gallery reads feed version IDs into the diff. Read-only, no migration. No watch API, no event tables, no scoring.
4. Tests: `packages/db/tests/changes.test.mjs` (11 tests: identical/added/removed/changed/reordered/empty/unsupported/missing/malformed/private/rights/pagination/ledger-duplicates), `apps/web/tests/changes.test.mjs` (3 transport tests incl. parity and no-oracle), R3 golden-journey integration proof.
5. Verify: `rg -n "get_changes" apps packages --glob '!node_modules'` returns implementation plus tests; `node --experimental-strip-types --test packages/db/tests/changes.test.mjs apps/web/tests/changes.test.mjs`.
6. Evidence: PR #106 (AF-15a, exact-head CI SUCCESS 15/15, post-merge SUCCESS) plus PR #113 (R3 journey) plus `P13_SCOPE_DISPOSITION.md` (PR #115); commercial launch explicitly MUST NOT be blocked by P13 per plan section 15.
7. Security/rights: tenant-scoped diff access via the central gate per artifact (private/orphan titles never in JSON); unknown versions answer not-found without oracle; takedown-aware event purge belongs to the future watch grain.
8. Status: PARTIAL.
9. Gap: read diff qualified; scheduled/explicit recapture policy, watch/subscribe API, persistent change-event log, and meaningful-change scoring remain post-launch per the authorized scope disposition (plan section 15).
10. Next: P13 watch grain only post-launch (recapture policy plus subscribe API with quota/cost attribution; scoring thresholds against labeled data).

## P14 — Create Beta via OpenPencil (plan section 14)

1. ID: P14.
2. Acceptance (literal, gated by stable P08–P12): reference-pack to OpenPencil document adapter; editable design generation via OpenPencil APIs/MCP (not a new canvas); .fig/.pen export/import where supported; design-token handoff; qualified pack turns into editable document; adapter isolated so Create evolves independently.
3. Implementation: `packages/editor-adapters/src/vector-adapter.ts` (VectorCraft headless `convert`/`info`/`commands`, `tokensToSvg`, `inspectSvg`), `raster-adapter.ts` (PhotoCraft headless `convert`/`info`/`commands`, magic-byte validation), `openpencil-adapter.ts` (OpenPencil headless `tree`/`node`/`query`/`info`/`export`/`convert` in file mode only, `.fig`/`.pen` inputs, `buildPenDocument` pack-to-document helper, SVG reopen inspection), `src/index.ts` public surface; UPSTREAMS `openpencil` entry pinned (MIT, `78355fd`, status ready, headless scope). No `.fig`/`.pen` genuine-binary round-trip proof yet; PageDraw primitives explicitly not transplanted.
4. Tests: `packages/editor-adapters/tests/vector-adapter.test.mjs`, `raster-adapter.test.mjs` (50/50 per AF-12 record incl. genuine-argv regressions; fixture executables only), `openpencil-adapter.test.mjs` (19 pass + 1 labeled genuine-binary skip: disabled/missing/invalid/opt-in reads/export-convert/pack journey/malformed/unsupported/traversal/symlink/timeout-cancel/budgets/shell-injection/env-secrets/rights/provenance/failure-typing/no-model).
5. Verify: `node --experimental-strip-types --test packages/editor-adapters/tests/vector-adapter.test.mjs packages/editor-adapters/tests/raster-adapter.test.mjs packages/editor-adapters/tests/openpencil-adapter.test.mjs`; `pnpm --filter skelet-editor-adapters lint`; `pnpm --filter skelet-editor-adapters typecheck`; `python scripts/validate_upstreams.py`.
6. Evidence: AF-10 (PR #89) vector adapter; AF-11 (PR #90) raster/PageDraw-boundary adapter; both disabled-by-default, root-confined, allowlisted argv, scrubbed env, timeouts/output caps; genuine VC/PC binary qualifications VERIFIED at pins; UPSTREAMS pins `vectorcraft 6c3f9f60aa69ac151f9908b94cf00a387746eea4`, `photocraft 97136485f0743251ab330d096ca6c9d0f0f6f54c`, `openpencil 78355fd3890cc9da9539235ee3b38beb917f2ed6` (evaluation PR #112; headless CLI plus fig/pen shortlist; app-bridge/desktop rejected); PR #121 headless OpenPencil adapter grain (file-mode allowlist, pack-to-pen-to-export-to-reopen journey on fixtures, 30-tool inventory untouched); HEAD CI `editor-adapters` SUCCESS.
7. Security/rights: absolute-path-only binaries (no PATH hijack), realpath confinement, refused `run`/`mcp`/`bench`/`batch`/`serve`, no shell/TCP/ambient secrets, SVG script/foreignObject/entity refusal, raster magic-match, per-job budgets, provenance `local`/`free-local`.
8. Status: PARTIAL.
9. Gap: OpenPencil headless adapter implemented with fixture-tested pack-to-editable-document journey (evaluation plus adapter grain complete); genuine-binary qualification before any export claim plus `.fig` round-trip fidelity proof plus PageDraw conditional remain (correctly deferred pending gap proof).
10. Next: genuine-binary qualification run once an operator binary at the pin is available (`SKELET_OPENPENCIL_BIN` conditional test already in tree); then `.fig` round-trip fidelity proof. P14 remains non-blocking for initial launch per plan.

## P15 — Commercial Launch Qualification (plan section 14)

1. ID: P15.
2. Acceptance: pricing/capability enforcement; production R2/S3 adapter; dashboards, rate limits, abuse controls, backups, restore drill; migration/runbook; privacy/terms/support; load tests for search/Lens/media/MCP; restore succeeds; SLOs/alerts documented; critical journeys pass on production-like env; zero blocking PStack-panel/OCR.
3. Implementation: `packages/db/src/billing.ts` capability model, `apps/web/lib/rate-limit.ts`, `packages/storage` filesystem plus S3-compatible adapter interface (local exercised; R2/S3 not exercised), `packages/db/src/backup.ts` plus `docs/operations/RUNBOOK.md` (drill plus takedown procedure), `scripts/bench_search.mjs` plus `scripts/bench_board_changes.mjs` (environment-relative latencies), `scripts/smoke-web.mjs`, `scripts/prove_starter_consumer.mjs`, `scripts/prove_registry_install.mjs`, `sbom.json` (380 components, freshness-enforced), `DEPENDENCY_SCAN.md`, `SLOS.md`, `docs/qualification/AF-12_RELEASE_QUALIFICATION.md` (AF-12i hygiene scope), `AF-12_FINAL_QUALIFICATION.md` (full sweep rerun).
4. Tests: `packages/db/tests/billing.test.mjs` (signed webhook/replay/seats fixture), `backup-restore.test.mjs` plus `pg-backup-restore.test.mjs` (round-trip incl. real PG), `migration-rehearsal.test.mjs` (up/down/up), `test_sbom.py` (4 conformance tests), rate/quota cases in `envelope-parity`, `mcp`, `rest`, `lens-jobs`, `mcp-lens`, `build-kit` suites, `tests/node/bench-board-changes.test.mjs` (bench schema proof); no dashboards, no alert-threshold tests, no privacy/terms surface tests.
5. Verify: `python -m unittest discover -s tests`; `pnpm install --frozen-lockfile`; full workspace lint/typecheck/test matrix per AF-12 record; `node scripts/smoke-web.mjs 3103`; `node scripts/prove_registry_install.mjs`; `node scripts/bench_search.mjs`; `node scripts/bench_board_changes.mjs`.
6. Evidence: AF-12i (PR #91) measured sweep plus honest limitations; AF-12 operations (PR #100) drill plus runbook; AF-12 release evidence (PR #101) SBOM/scans/rehearsal/SLOs; AF-12 final qual (PR #102) full sweep rerun with zero failures; AC-00 perf leg (PR #114) board-adjacent baselines; HEAD CI SUCCESS 15/15 on every head since.
7. Security/rights: capability model independent of hard-coded prices; quotas enforced in tests; production abuse/egress/backup/takedown operations proven at drill scale, not production scale.
8. Status: PARTIAL.
9. Gap: production storage exercised only as interface plus local adapter; no dashboards or alert-threshold implementation; no signed release artifact; no production-scale load proof (benches are PGlite-relative); no privacy/terms/support surfaces review.
10. Next: (a) dashboards plus abuse alarms with threshold tests; (b) signed release artifact procedure; (c) privacy/terms/support surfaces; (d) production-like load proof for search/Lens/media/MCP before any hosted offer. Managed SaaS remains explicitly not offered until budgeted per AF-00.

---

## R0 — Provenance

1. ID: R0.
2. Acceptance: every donor binds to immutable commit/release/hash at execution; code vs data/asset/model/service/trademark scopes separated; per-capability dependency closure; preserved notices; malformed/mutable entries fail validation; per-item serving policy.
3. Implementation: `UPSTREAMS.lock.yml` (38 sources per AF-12 record), `schemas/upstreams.schema.json`, `CODE_PROVENANCE.md`, `DATA_PROVENANCE.md`, `docs/provenance/*`, `imports/craft-suite/manifest.json` plus `donor-pins.json`, `scripts/validate_upstreams.py`.
4. Tests: `tests/test_validate_upstreams.py`, `tests/test_monet_import_manifest.py`, `tests/test_craft_audit_af01.py`, `tests/test_monet_dependency_closure.py`.
5. Verify: `python scripts/validate_upstreams.py`; `python -m unittest discover -s tests -v`.
6. Evidence: AF-01 (PR #67) immutable craft-suite audit; G00-02 plus G01 grains; HEAD CI `bootstrap` SUCCESS.
7. Security/rights: no branch-name-only pins; third-party exclusions preserved; source permission never implies asset/model/trademark rights.
8. Status: VERIFIED (for code/source provenance in repo; dataset/asset/model/trademark permissions remain per-item gates at serving time, covered by R3–R6 tests).
9. Gap: none for R0 mechanism; keep enforcing at every future import.
10. Next: none; block any future grain with ambiguous provenance.

## R1 — Runnable Shell

1. ID: R1.
2. Acceptance: clean checkout installs; strict lint/typecheck/build; app starts and health/smoke passes; no donor-content dependence for shell.
3. Implementation: `apps/web/app/api/health/route.ts`, `apps/worker` health command, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `scripts/smoke-web.mjs`.
4. Tests: `apps/web/tests/health-route.test.mjs`, `apps/worker/tests/cli.test.mjs`, `env.test.mjs`, CI `web`/`worker` jobs.
5. Verify: `pnpm install --frozen-lockfile`; `pnpm --dir apps/web lint && pnpm --dir apps/web typecheck && pnpm --dir apps/web build`; `node scripts/smoke-web.mjs 3103`; `pnpm --dir apps/worker start health`.
6. Evidence: G01-03a/b, G02-02, plus every subsequent exact-head CI; AF-12 record production build PASS plus SMOKE_OK; HEAD CI `web`/`worker` SUCCESS.
7. Security/rights: health exposes no secrets; smoke uses ephemeral ports and shuts down.
8. Status: VERIFIED.
9. Gap: none.
10. Next: none.

## R2 — Tenant/Domain/Storage

1. ID: R2.
2. Acceptance: workspace roles and server-side authorization on every read/write; forged IDs denied; expired sessions denied; anonymous writes denied; content-addressed storage with dedupe; idempotent domain writes; quotas/rate limits not bypassable via alternate interfaces.
3. Implementation: `packages/db/src/auth.ts`, `workspaces.ts`, `collections.ts`, `artifact-access.ts`, `idempotency.ts`, `packages/storage/src/*`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/boards.ts` ownership/handoff.
4. Tests: `auth.test.mjs`, `workspaces.test.mjs`, `collections.test.mjs`, `artifact-access.test.mjs`, `jobs.test.mjs` idempotency, board two-workspace denial, `envelope-parity`/`rest`/`mcp` denial parity, storage dedupe tests.
5. Verify: `node --experimental-strip-types --test packages/db/tests/auth.test.mjs packages/db/tests/workspaces.test.mjs packages/db/tests/collections.test.mjs packages/db/tests/artifact-access.test.mjs packages/storage/tests/storage.test.mjs`.
6. Evidence: PRs #23–#26, AF-SEC-00 (PR #66) actor-scoped reads, AF-09 handoff ledger (PRs #87–#88); HEAD CI `db-foundation`/`web` SUCCESS.
7. Security/rights: title/rights metadata treated as private; search/cache/preview/board/export/pack paths all gated by same central check (no per-interface fork).
8. Status: VERIFIED (for implemented surfaces; new surfaces must reuse the same gate, which is a future-grain obligation, not a current failure).
9. Gap: every new read path (including future `find_similar`/`compare_design`/`get_changes`/Apps) must add denial fixtures before exposure.
10. Next: enforce R2 fixtures in each upcoming feature grain; no separate R2 project.

## R3 — S0 End-to-End (no-model)

1. ID: R3.
2. Acceptance: rights-cleared fixture flows through ingest, canonical persistence, search, human inspection, collection save, reference-pack export, and REST/MCP recovery from another client, with authenticated and anonymous negative tests and zero external model.
3. Implementation: fixture corpus plus `packages/ingest`, `packages/assets`, `packages/db` (incl. `gallery.ts`, `changes.ts`), `apps/web/lib/reference-packs.ts`, `apps/web/lib/mcp.ts` (24 tools), `apps/web/app/api/v1/*`, `skills/*`, `scripts/check_no_model.py`, `packages/no-model`.
4. Tests: `publish.test.mjs`, `assets/search.test.mjs`, `apps/web/tests/search.test.mjs`, `mcp.test.mjs` pack round-trip, `interop-http/stdio`, `rest.test.mjs`, `envelope-parity.test.mjs`, `no-paid-path.test.mjs`, `no-model.test.mjs`, `tests/test_no_model.py`, `apps/web/tests/golden-journey.test.mjs` (PR #113: ten-stage S0 proof with MCP/REST parity, PGlite fixture, no mocks on agent paths).
5. Verify: `SKELET_NO_MODEL=1 python scripts/check_no_model.py --root .`; `SKELET_NO_MODEL=1 pnpm --dir apps/worker start health`; `node --experimental-strip-types --test packages/no-model/tests/no-model.test.mjs packages/lens/tests/no-paid-path.test.mjs apps/web/tests/golden-journey.test.mjs`; full pack round-trip suites.
6. Evidence: AF-02 (PR #68) zero-model/egress conformance, AF-03a–c (PRs #69–#71), AF-04 (PR #72), `docs/qualification/NO_MODEL_BUILD_KIT.md`, R3 golden journey (PR #113); HEAD CI `no-model` SUCCESS.
7. Security/rights: private content never enters external model path; deterministic path succeeds with all provider secrets missing; AnalysisRun egress classification where external inference is used; journey asserts outsider isolation with no oracle.
8. Status: PARTIAL.
9. Gap: S0 is proven on synthetic/rights-cleared fixtures across the qualified toolset (now 30 tools) plus the gallery/flow/taxonomy UI reads, but not on a qualified real research corpus with live capture (P10 capture client), nor on deferred surfaces (single-shot analysis, Apps views). Anonymous/authenticated negative coverage exists for implemented paths but cannot cover unimplemented UI/Apps/capture surfaces.
10. Next: re-run the golden journey against the replay transport once live capture lands; then record the expanded journey as R3 evidence.

## R4 — Guarded Lens

1. ID: R4.
2. Acceptance: URL capture security matrix (localhost/127/8, IPv6 loopback/link-local/private, RFC1918, CGNAT, metadata, public-DNS-to-private, redirect-to-private, rebinding, file/data/javascript/ftp schemes, oversize, redirect loop, timeout/cleanup, SVG/HTML isolation, worker secret isolation) plus prompt-injection-as-data and egress-off deterministic path.
3. Implementation: `packages/lens/src/url-guard.ts`, `capture-network.ts`, `capture-child.ts`, `capture-worker.ts`, `report-assembly.ts`, `export-surface.ts`.
4. Tests: `url-guard.test.mjs`, `capture-network.test.mjs`, `capture-browser.test.mjs`, `report-assembly.test.mjs` (hostile stays data), `export-surface.test.mjs`, `no-paid-path.test.mjs`.
5. Verify: `node --experimental-strip-types --test packages/lens/tests/url-guard.test.mjs packages/lens/tests/capture-network.test.mjs packages/lens/tests/capture-browser.test.mjs packages/lens/tests/report-assembly.test.mjs`.
6. Evidence: G09-01–G09-03 plus AF-05e/g; ISSUE_9_MATRIX criterion 6; AF-12 record lens 197/197; HEAD CI `lens` SUCCESS.
7. Security/rights: fail-closed resolver/redirect/rebind/subresource posture; isolated secret-free child proven by test; no prod cookies/keys in worker.
8. Status: VERIFIED.
9. Gap: none for qualified Lens report path; P09b inherits R4.
10. Next: none; require R4 fixtures in every future capture change.

## R5 — Qualified Corpus/Search and Agent Interoperability

1. ID: R5.
2. Acceptance: corpus remains usable with donor endpoints disabled; lexical baseline with frozen relevance judgments before any vector model; exact model/runtime pins, CPU/RAM/time benchmarks, egress-off fallback, no mandatory GPU; 3-host MCP matrix with OAuth/audience/PKCE/issuer where remote, Tasks optional with REST fallback; no second canonical search contract.
3. Implementation: lexical search stack (see P11) with all-kinds similarity, `packages/db` corpus tables plus gallery reads, `imports/*` manifests plus both closure inventories, `apps/web/lib/agent-contract.ts` `skelet.agent.v1`, `scripts/mcp_stdio.mjs`, SDKs/CLI, R3 golden-journey proof, `docs/qualification/ISSUE_9_MATRIX.md` criterion 7 donor posture.
4. Tests: frozen `search-relevance.json` plus search suites, `bench_search.mjs` plus `bench_board_changes.mjs`, `interop-http.test.mjs`, `interop-stdio.test.mjs`, `test_mcp_interop_py.py`, SDK envelope tests, `validate_agent_contract.py`, `golden-journey.test.mjs`.
5. Verify: `node scripts/bench_search.mjs`; `node scripts/bench_board_changes.mjs`; `python scripts/validate_agent_contract.py`; interop suites in `apps/web/tests/`.
6. Evidence: AF-03c three-wire-client proof; AF-04 lexical baseline; AF-01 donor evaluation-first posture; AF-14b-i all-kinds similarity; AF-14d gallery reads; R3 journey; `P11_SCOPE_DISPOSITION.md`; HEAD CI `web`/`sdk`/`bootstrap` SUCCESS.
7. Security/rights: rights filter before rank (central-gate-mirroring predicate since AF-14c fix); no silent vector/GPU dependency; temporary Monet/Orama logic, if any, stays behind migration adapter and never becomes canonical.
8. Status: PARTIAL.
9. Gap: corpus is fixtures/synthetic, not an authorized real product corpus; relevance judgments are frozen synthetic, not human-judged at launch scale; semantic/visual embeddings absent by authorized disposition; taxonomy (30 tools) and replay transport are now evidenced but live capture is not; remote OAuth/PKCE/issuer hardening for hosted remote MCP is planned but local/stdio plus bearer-gated HTTP is the evidenced path (managed remote remains future per AF-00 deployment contract).
10. Next: real-corpus authorization only with a rights-cleared dataset and provenance; embedding plugin only on measured inadequacy; remote hardening only if a customer-hosted remote offer is scoped. Do not claim hosted SaaS readiness.

## R6 — Local/Paid Beta Security plus Operations

1. ID: R6.
2. Acceptance: quotas/CPU/bytes/rate limits and abuse alarms/kill-switch; browser-minute/storage/egress cost attribution and margin evidence; retention/backup/purge/restore with RPO/RTO; signed webhooks with replay/out-of-order/downgrade/seat/quota handling; takedown plus derivative/cache purge end-to-end; runtime integrity/SBOM/least-privilege CI.
3. Implementation: `apps/web/lib/rate-limit.ts`, kit/board quotas in `build-kit.ts`/`boards.ts`/`lens-jobs`, `packages/db/src/billing.ts` webhook intake, `packages/lens` expiry/purge paths, CI pinned SHAs plus frozen installs.
4. Tests: quota-exhaustion/release, idempotent replay, cancel/retry/resume, download/purge denial, billing webhook replay/out-of-order, tombstone/purge cases across `lens-jobs`, `mcp-lens`, `build-kit`, `billing`, `boards` suites.
5. Verify: quota/replay/purge subsets of the suites above; `python -m unittest discover -s tests`; exact-head CI.
6. Evidence: AF-05c/f/g quota/expiry/reaper coverage; AF-05e download/purge; AF-09 handoff ledger; AF-12i hygiene; AF-12 operations drill (PR #100) plus runbook; AC-00 perf baselines (PR #114); AF-14c gate fix (PR #117); HEAD CI SUCCESS.
7. Security/rights: per-user/workspace/API quotas; unapproved egress denied in no-model gate; takedown removes bytes plus derivatives/thumbnails/caches where implemented (kit/board paths), but full lifecycle purge across OCR/embeddings/CDN remains unproven because those stores do not exist in the no-model core.
8. Status: PARTIAL.
9. Gap: no RPO/RTO proof beyond the drill; no browser-minute/storage/egress unit-economics dashboard; no abuse alarm/kill-switch beyond test-level quota denial; no production R2/S3 backup; per-item takedown automation beyond kit/board purge paths remains manual per the runbook.
10. Next: abuse alarms plus unit-economics dashboard before any paid/hosted claim. Local single-user remains the only supported zero-founder-spend mode per AF-00.

## R7 — Release Correctness

1. ID: R7.
2. Acceptance: signed release, SBOM, dependency/secret scans, migration rehearsal, restore and incident exercise; SLOs/alerts documented; critical journeys pass on production-like env; zero blocking PStack-panel/OCR.
3. Implementation: `.github/workflows/ci.yml` 15-job exact-head gates, `scripts/ci_hygiene.py` binary/secret guardrails, `requirements-ci.txt` hashed pins, `pnpm-lock.yaml` frozen installs, migration-tested DB suites, smoke/consumer/registry proofs.
4. Tests: `tests/test_ci_hygiene.py`, migration suites, `smoke-web.mjs`, `prove_starter_consumer.mjs`, `prove_registry_install.mjs`, per-grain PStack/OCR/Graft records under `docs/reviews/` (the historical `*_JEV_REVIEW.*` files stay as evidence of what ran at the time).
5. Verify: exact-head CI on the release candidate; `python scripts/ci_hygiene.py --expected-head <HEAD>`; full local qualification matrix per AF-12 record.
6. Evidence: PR #91 plus PRs #100 (drill plus runbook), #101 (SBOM/scans/rehearsal/SLOs), #102 (final qual rerun with zero failures), all per-grain `docs/reviews/AF-*` records; HEAD CI SUCCESS on every head since (15/15 each, incl. post-merge mains).
7. Security/rights: exact-HEAD checkout enforcement; no force-push/squash/rebase on governed branches; normal merges only; post-merge verification required.
8. Status: PARTIAL.
9. Gap: R7 is not satisfied by CI alone: no signed release artifact, no dashboards or alert-threshold implementation, no production-scale load proof (benches are PGlite-relative), no privacy/terms/support surfaces review, no production-like critical-journey run after final code (last full sweep ran on `8027264`; heads since then are covered per-grain plus CI, not by a fresh full sweep).
10. Next: a named final qualification rerun on the release-candidate HEAD once the remaining P10/P12/P14/P15 work lands (or a scoped interim rerun if the frontier stays stable); then dashboards/alerts, signed artifact, and privacy/terms surfaces. Do not declare release-complete on green CI alone.

---

## Issue #62 — ArtCraft Disposition (separate from P-status above)

Accepted program: Issue #62 AC-00–AC-04 with 7 global gates and 3 journeys. AF-01/AF-06/AF-07/AF-08/AF-10/AF-11 are partial satisfactions, not closeout.

- AC-00 qualified inventory and import design: PARTIAL. Prior record stands, plus: AC-00-ii frame-extractor closure (2 frozen files at pinned services commit `02a3de2`, live-verified SHAs, zero-import candidate plus excluded provider-coupled sibling, 8 offline conformance tests; PR #108); AC-00 perf-baseline leg (`scripts/bench_board_changes.mjs` plus CI schema proof; board-adjacent read latencies environment-relative; PR #114). Rollback criterion now measurable. Remaining: frozen fixtures and per-file manifests for post-launch candidates, required only if their transplants activate (none planned). No runtime transplant started.
- AC-01 P10 video reference import: KEEP DECIDED (PR #109, `AC-01_VIDEO_FRAME_DECISION.md` with 7 machine-checked tests). Skelet-owned bounded frame engine retained over donor `extract-frames.ts` on six measured grounds (no dependency win, stricter bounds, deterministic timestamps, PNG-vs-JPEG incompatibility, layer-mismatch cost, covered cancellation) with a two-case revisit trigger. Journey (a) video to timestamped artifacts/flow remains exercisable on fixtures via the Skelet-owned path.
- AC-02 P12 reference boards: KEEP DECIDED (PR #110, `AC-02_BOARD_DECISION.md` with 8 machine-checked tests). Skelet-owned ordered-collections board retained over the moodboard transplant on five measured grounds (sync core would be discarded, foreign state stack for unneeded richness, no handoff/rights counterpart, grid lead insufficient, keyboard parity) with two revisit triggers. Journey (b) passes on the Skelet-owned board. No transplant performed.
- AC-03 P14 vector/raster adapters: PARTIAL. Prior record stands (genuine VC/PC binary qualifications VERIFIED at pins; PageDraw conditional stands deferred), plus: OpenPencil provider evaluation (PR #112; live HEAD `78355fd`, 0.16.0, MIT; headless CLI plus fig/pen shortlist; app-bridge/desktop rejected) and the headless OpenPencil adapter grain (PR #121; allowlisted file-mode CLI, pack-to-pen-to-export-to-reopen journey on fixtures, genuine-binary conditional test in tree). Remaining: (i) genuine-binary qualification before any export claim; (ii) `.fig` round-trip fidelity proof; (iii) PageDraw conditional unchanged.
- AC-04 post-launch evaluation: DISPOSITIONED (PR #111, `AC-04_POST_LAUNCH_DISPOSITION.md` with 4 machine-checked tests). All five candidates DEFERRED with measured triggers, rights preserved, pins traceable. No launch delay.
- Global gates: (1) no architectural inversion holds (PostgreSQL/graph/storage/auth/quota/MCP/REST/rights authoritative; no MySQL/Redis/Elasticsearch transplant); (2) rights fail closed holds for implemented paths, including the AF-14c similarity-gate fix (PR #117) that closed a real cross-tenant leak class; (3) agent parity holds for implemented objects via stable `skelet://` URIs (24 tools plus REST parity; single-shot analysis and Apps views remain parity gaps with authorized dispositions, not passes); (4) performance now HAS board/import/search latency baselines on constrained hardware (bench_search plus bench_board_changes; rollback criterion measurable); bundle-size baseline remains open; (5) tests/reviews discipline holds per grain (PStack panel with independent fresh-context judges or an explicitly labelled degraded review, delegate-only OCR labeled non-LLM, Graft, exact-head CI, normal merge, post-merge CI); (6) no launch disruption holds; (7) Skelet identity holds with provenance/NOTICE preserved.
- Journeys: (a) PARTIAL-pass on Skelet-owned frames (not ArtCraft code); (b) PARTIAL-pass on Skelet-owned board (not transplanted moodboard); (c) PASS for VectorCraft/PhotoCraft at pins (genuine-binary qualifications supersede fixture-only; PageDraw/OpenPencil journeys remain future).

Disposition: Issue #62 stays OPEN. AC-01/AC-02/AC-04 are decided with evidence; AC-03 needs the OpenPencil adapter grain plus journey; AC-00 needs post-launch manifests only if those transplants activate. It may close when those land, or on an owner-authorized disposition with the same evidence. Continuing independent P10/P12/P14/P15 work is required while any item is blocked.

---

## Verified Coverage Calculation (from rows above, no invented percent)

- Total rows: 25 (P00–P15 inclusive is 16 phases plus P09b equals 17 phase rows; R0–R7 equals 8 control rows).
- VERIFIED: 14 (P00, P01, P02, P03, P04, P05, P06, P07, P09, P09b, R0, R1, R2, R4).
- PARTIAL: 11 (P08, P10, P11, P12, P13, P14, P15, R3, R5, R6, R7).
- NOT STARTED: 0 (P13 read API qualified in PR #106; watch/scoring post-launch per disposition).
- NOT APPLICABLE: 0 (no phase is excluded; P11/P13/P14 deferrals are authorized scope delays, not exclusions; SDK-lens-only NOT APPLICABLE qualifier lives inside P09b and does not remove P09b from coverage).
- Coverage: 14/25 VERIFIED (56.0%). Remaining actionable rows: 11.
- Reconciliation note (2026-10-15, base `0769cb9`): 17 implementation grains advanced rows without flipping literal statuses, because every remaining gap is an authorized deferral (embeddings, watch/scoring, Apps views, gallery UI/player/taxonomy/rrweb, OpenPencil journey, prod-scale ops) rather than unscoped work. Progress is recorded in the delta log and the scope-disposition records, not in the percentage.

## Highest-Priority Next Grains (work queue, not a plan to stop after)

1. P14 genuine-binary qualification plus `.fig` round-trip fidelity proof (adapter grain complete with fixture journey; run once an operator binary at the pin is available).
2. P10 live capture disposition plus Mobbin normalization note plus screen gallery wording (reads/UI/player/taxonomy/replay qualified; capture client remains).
3. P15 hardening: production R2/S3 exercise at scale, dashboards plus abuse alarms, signed release artifacts, privacy/terms/support surfaces, SLO/alert documentation, production-like load proof for search/Lens/media/MCP.
4. P11 embedding plugin only on measured lexical inadequacy (pinned model/rights/perf/CPU acceptance, opt-in install, deterministic fallback); hybrid ranker only on benchmark-justified gain.
5. P13 watch grain only post-launch (recapture policy plus subscribe API with quota/cost attribution; scoring thresholds against labeled data).
6. AC-00 frozen fixtures for post-launch candidates only if their transplants activate; no transplant planned.
7. Final full-system release qualification rerun on the release-candidate HEAD once the above land (or a scoped interim rerun if the frontier stays stable).

---

## Post-Audit Deltas (append-only; the rows above remain the audit of `543641a`)

- PR #92 (`ce6ba14`, CI SUCCESS 15/15 exact-head and post-merge): this matrix document itself plus review records. No product change.
- PR #93 (`b2de7b3`, CI SUCCESS 15/15 both): AF-13a-i deterministic `find_similar` (MCP + REST + skill + CI). P08 gap #1 closed; P08 row otherwise unchanged.
- PR #94 (`0ebd53d`, CI SUCCESS 15/15 both): AF-13a-ii observed `compare_design` (MCP + REST + skill + CI). P08 gap #2 closed; P08 row otherwise unchanged (still PARTIAL: `get_changes`, MCP Apps).
- PR #95 (`b745a3e`, CI SUCCESS 15/15 both): AC-00-i moodboard closure (70 SHA-verified files, 8 externals, SmartSearchBar excluded). Issue #62 AC-00 partially advanced; no transplant authorized.
- Genuine VectorCraft binary qualification (`docs/qualification/VECTORCRAFT_BINARY_QUALIFICATION.md`): converts the AF-10 adapter's upstream compatibility from UNVERIFIED to VERIFIED at commit `6c3f9f60aa69ac151f9908b94cf00a387746eea4` for `convert`/`info`/`commands` plus refusal paths. PhotoCraft genuine-binary qualification remains open. Fixture suites remain the CI story; this record is the upstream-compatibility evidence.
- Genuine PhotoCraft binary qualification (`docs/qualification/PHOTOCRAFT_BINARY_QUALIFICATION.md`): converts the AF-11 adapter's upstream compatibility from UNVERIFIED to VERIFIED at commit `97136485f0743251ab330d096ca6c9d0f0f6f54c`, inclusive of two genuine defects the fixtures missed and the fix grain repaired (`commands --json`; bare `--tiff-layers` flag with `flatten` sending nothing). AC-03 adapter qualification is complete for VectorCraft and PhotoCraft at their pins; PageDraw stays deferred, OpenPencil stays P14 scope.
- PR #97 (`3d061b0`, CI SUCCESS 15/15 both): AF-11 genuine raster fix (the two argv defects above) with regression tests; PhotoCraft compatibility VERIFIED. No other surfaces changed.
- PR #98 (`4e23f70`, CI SUCCESS 15/15 both): AF-14a authorized corpus importer (validate-first, ledger-idempotent, conflict-closed) with migration 016 (flow ledger targets, guards, rollback proven on PGlite and real PostgreSQL), `list_flows`/`get_flow_steps` MCP tools plus two REST routes (deep-equal parity), research skill step, inventory 18->20. P10 framework gap closed; gallery UI, flow player, taxonomy, and rrweb remain follow-ons.
- AF-12 operations drill (`packages/db/src/backup.ts` + `docs/operations/RUNBOOK.md`): corpus-subgraph snapshot/wipe/restore with ID-preserving re-insert and per-table verification, proven on PGlite and real PostgreSQL (CI `db-foundation` job). Production backup stays `pg_dump` plus store snapshot per the runbook; per-item takedown automation beyond kit/board purge paths remains a follow-on with the manual procedure defined here.
- AF-12 release evidence (unified: `package.json` postcss override + root `sbom.json` via `scripts/generate_sbom.py` + `tests/test_sbom.py` + `DEPENDENCY_SCAN.md` + `AF-12_RELEASE_HARDENING.md` + `SLOS.md` + `migration-rehearsal`): pnpm override pins `postcss` to `8.5.30`, closing 4 audit advisories (post-change `pnpm audit`: 1 remaining, braces dev-only accepted risk with revisit trigger); committed 380-component CycloneDX SBOM (freshness-enforced by `--check` plus 4 conformance tests); full migration up/down/up rehearsal proven on scratch hardware (CI `db-foundation` job) plus real-PG 16↔16 record; SLO targets with measured lexical baseline (p95 ~10.5 ms on 200 records, PGlite) and operator-verifiable objectives. Final release qualification stays a separate follow-on.
- AF-12 final qualification (`AF-12_FINAL_QUALIFICATION.md`, base `8027264`): full measured sweep rerun with zero failures (lint/typecheck 11/11, python 182/182, node web/worker 114/114, assets 33/33, ingest 14/14, providers group 39/39, adapters 50/50, lens 197/197 incl. real Chromium, db non-PG 116/116, real PG 15/15 on fresh fixture DBs, all validators plus SBOM-check plus hygiene PASS, 1 remaining audit advisory under accepted risk, web build plus SMOKE_OK plus STARTER_CONSUMER_OK plus REGISTRY_INSTALL_PROOF_OK, graft green). No product change needed. Ends with honest limitations and a matrix-referenced verdict, not a standalone release declaration.
- AF-13b-i deterministic `search_registry` (MCP + REST + skill + CI): substring search over the static component index (index-ordered, bounded, empty-query lists all) with `searchRegistryRoute` deep-equal parity, skill step, validator promotion (`search_registry` implemented), inventory 20->21. P08 gap closed for registry discovery; `resolve_asset`/`analyze_image`/`get_changes`/MCP Apps remain.
- AF-13b coverage (`AF-13B_COVERAGE.md`, docs-only with re-proven suites): `resolve_asset` intent covered by `get_asset` + `get_object` (no read-time ambiguous namespace exists; separate verb would duplicate or mistarget), verified by mcp 11/11 plus parity 14/14 plus rest 5/5; `analyze_image`/`analyze_url` intent covered by the qualified Lens job path with single-shot explicitly deferred per skill gating and validator. `get_changes`/MCP Apps/compaction stay open.
- AF-14c coverage (`AF-14C_COVERAGE.md`, docs-only with re-proven suites): pack-read intent covered by `get_object` collection branch on both transports (capability-gated export with partial/warning semantics); compaction intent covered by versioned `skelet/reference-pack/1` (citation, rights, freshness, missing-data). Separate `get_reference_pack` verb would duplicate. Verified by boards 9/9 plus boards-ui 5/5 plus parity/rest 19/19. AC-02 transplant decision, `get_changes`, MCP Apps stay open.
- PR #103 (`e94611b`, exact-head CI `38613988043` SUCCESS 15/15, post-merge CI `38614535815` SUCCESS): AF-13b-i deterministic `search_registry` (MCP + REST + skill + CI, inventory 20->21). P08 gap closed for registry discovery. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green.
- PR #104 (`530bd73`, exact-head CI `38615797512` SUCCESS 15/15, post-merge CI `38616336103` SUCCESS): AF-13b coverage record (`AF-13B_COVERAGE.md`, docs-only with re-proven suites mcp 11/11, parity 14/14, rest 5/5). `resolve_asset` covered by `get_asset`/`get_object`; single-shot analysis deferred to the Lens job path. `get_changes`/MCP Apps/compaction stay open.
- PR #105 (`0894f96`, exact-head CI `38617427276` SUCCESS 15/15, post-merge CI `38618754109` SUCCESS): AF-14c coverage record (`AF-14C_COVERAGE.md`, docs-only with re-proven suites boards 9/9, boards-ui 5/5, parity/rest 19/19). No separate `get_reference_pack` verb. Boundary declared: no further coverage-prose grains.
- PR #106 (`b86c8a4`, exact-head CI `38654214419` SUCCESS 15/15, post-merge CI `38655531817` SUCCESS): AF-15a P13 smallest grain, deterministic `get_changes` version diff (`packages/db/src/changes.ts`, ledger-backed identity, tags equality, rights-gated, paginated, deterministic) with MCP tool plus REST `GET /api/v1/changes` (deep-equal parity), skill step, validator promotion, CI wiring. Read-only, no migration. Tests: db 127/127 (11 new), web/node/worker 121/121 (3 new), python 182/182. P13 moves NOT STARTED -> PARTIAL (read API qualified; scheduling/scoring post-launch per `P13_SCOPE_DISPOSITION.md`). Reviews: genuine Jev ok:true, OCR delegate-only zero blocking (one duplicate-key defect found and fixed), PStack fallback, Graft green.
- PR #107 (`413dc18`, exact-head CI `38657929069` SUCCESS 15/15, post-merge CI `38659072181` SUCCESS): AF-14b-i P11 smallest grain, `find_similar` kinds widened from the registry triple to all 11 canonical kinds via `ARTIFACT_KINDS` (lexical baseline unchanged) with MCP schema enum plus 1 db-level and 1 transport screen test. No new tools (inventory stays 21), no migration. Assets 26/26, web 122/122. P11 artifact-to-similar gap closed for corpus kinds; embeddings/hybrid/judged stay deferred per `P11_SCOPE_DISPOSITION.md`.
- PR #108 (`a4cd2eb`, exact-head CI `38662079504` SUCCESS 15/15, post-merge CI `38664357868` SUCCESS): AC-00-ii frame-extractor closure (2 frozen files at pinned services commit `02a3de2`, live-verified SHAs, zero-import candidate plus excluded provider-coupled sibling, 8 offline conformance tests). JSON-only audit metadata; no donor code. Python 190/190.
- PR #109 (`67d4cf1`, exact-head CI `38668014569` SUCCESS 15/15, post-merge CI `38668621218` SUCCESS): AC-01 measured keep decision (KEEP Skelet-owned video-frame engine, no transplant; six reasons incl. PNG-vs-JPEG incompatibility; two-case revisit trigger) with 7 machine-checked tests (two-tier fact traceability). Python 197/197.
- PR #110 (`11b84c5`, exact-head CI `38670679531` SUCCESS 15/15, post-merge CI `38671046276` SUCCESS): AC-02 measured keep decision (KEEP Skelet-owned board: 8 routes, 1 page, 3 MCP tools, migrations 014/015, zero canvas deps; donor 70 files, 8 externals, 38-file Konva canvas, sync core requiring replacement, no handoff/rights paths; five reasons; two revisit triggers) with 8 machine-checked tests (test-first counting correction 38/15). Python 205/205.
- PR #111 (`fddf36e`, exact-head CI `38672116488` SUCCESS 15/15, post-merge CI `38672724758` SUCCESS): AC-04 post-launch disposition (DEFER all five with measured triggers, rights preserved, pins traceable) with 4 machine-checked tests. No code change. Python 209/209.
- PR #112 (`51d54b2`, exact-head CI `38673815315` SUCCESS 15/15, post-merge CI `38674403567` SUCCESS): P14 entry gate, OpenPencil provider evaluation (live HEAD `78355fd` with clone agreement, 0.16.0, MIT; headless CLI plus fig/pen shortlist; app-bridge/desktop rejected; bun/wasm/token flags). UPSTREAMS openpencil planned->ready. No source import.
- PR #113 (`e636adb`, exact-head CI `38675581645` SUCCESS 15/15, post-merge CI `38676155742` SUCCESS): R3 golden-journey integration proof (two-version corpus import through search/inspect/similar/compare/flows/steps/changes/pack/recovery/save/denial with MCP/REST parity, PGlite fixture, no mocks on agent paths). Test-only grain, auto-wired into web CI. Web/node/worker 123/123.
- PR #114 (`3e70aed`, exact-head CI `38677137648` SUCCESS 15/15, post-merge CI `38677703969` SUCCESS): AC-00 perf-baseline leg (`scripts/bench_board_changes.mjs` plus CI schema proof; full-size baseline Mac PGlite environment-relative: flows p95 9.76 ms, steps 0.6 ms, changes 16.74 ms, similar 1.79 ms; recorded, never gated). Rollback criterion now measurable. One genuine edge-case fix during review (versions clamp).
- PR #115 (`bd9039e`, exact-head CI `38678535462` SUCCESS 15/15, post-merge CI `38679085831` SUCCESS): P13 scope disposition (read API qualified now; watch/scoring post-launch with triggers, plan-grounded) with 4 machine-checked tests. No code change. Python 213/213.
- PR #116 (`31f877a`, exact-head CI `38680012817` SUCCESS 15/15, post-merge CI `38680283298` SUCCESS): P11 scope disposition (lexical baseline qualified now; embeddings/hybrid/judged opt-in futures with triggers, plan-grounded; vector absence scanned) with 4 machine-checked tests. No code change. Python 217/217.
- PR #117 (`932c958`, exact-head CI `38681466304` SUCCESS 15/15, post-merge CI `38682054323` SUCCESS): AF-14c SECURITY FIX. The AF-14b-i kinds expansion widened a candidate predicate admitting every global row, leaking global non-public non-registry titles/metadata via `find_similar`. Predicate now mirrors `getArtifactForActor` exactly (fail-closed narrowing only; search untouched). Leak reproduced FAILING before the fix; first broad attempt caught by the workspace suite and narrowed pre-commit. Assets 27/27 (1 new), web 125/125 (1 new).
- PR #118 (`d3780f3`, exact-head CI `38684062094` SUCCESS 15/15, post-merge CI `38684635070` SUCCESS): AF-14d P10 smallest gallery grain (`list_products`/`list_product_versions` with central-gate visibility, unknown/withheld read as empty, MCP/REST parity, pagination, skill + validator, inventory 22->24, CI wiring). Version IDs feed flows/changes. Read-only, no migration. DB 133/133 (6 new), web 128/128 (3 new).
- PR #119 (`0769cb9`, exact-head CI `38685600298` SUCCESS 15/15, post-merge CI `38686270043` SUCCESS): P12 Apps disposition (qualified core without Apps; `ui://` views deferred with sandbox-conditioned trigger) with 4 machine-checked tests. No code change. Python 221/221.
- PR #121 (`a169976`, exact-head CI `38693615977` SUCCESS 15/15, post-merge CI `38694348219` SUCCESS): P14 headless OpenPencil adapter grain (`openpencil-adapter.ts` with file-mode tree/node/query/info/export/convert, `.fig`/`.pen` inputs, fig-only convert, app-bridge refusal, pin equality, confinement, scrubbed env, budgets, deterministic errors; `buildPenDocument` pack-to-pen helper; 19 fixture tests + 1 labeled genuine-binary skip; index exports; CI test-list line). Fixture success is not genuine-binary proof. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green.
- PR #122 (`bb68239`, exact-head CI `38697027062` SUCCESS 15/15, post-merge CI `38698046113` SUCCESS): P10-A gallery UI (`/gallery` over qualified reads with bearer auth, filter, top-level cursor pagination, stable URIs, empty/loading/error states, aria-live; 6 source tests incl. cursor-nest regression for a real pre-commit defect). No backend change. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green, production build.
- PR #123 (`e5868d5`, exact-head CI `38699622629` SUCCESS 15/15, post-merge CI `38700621087` SUCCESS): P10-B flow player (`/flows` inspection/playback over qualified reads with deterministic order, bounded prev/next, no fabricated interactions; 5 source tests). No backend change. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green, production build.
- PR #124 (`4777ea5`, exact-head CI SUCCESS 15/15, post-merge CI SUCCESS): P10-C1 taxonomy reads (`patterns.ts` with slug/title/description validation and relation-linked visibility; `list_patterns`/`get_pattern` MCP tools plus REST/API routes with deep-equal envelopes; validator URI set; skill step; inventory 24->26; DB 6/6, web parity 3/3). Read-only, no migration. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green.
- PR #125 (`0283d72`, exact-head CI SUCCESS 15/15, post-merge CI `38708087880` SUCCESS): P10-C2 taxonomy UI (`/patterns` over qualified reads with filter, cursor pagination, detail links; 5 source tests). No backend change. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green, production build.
- PR #126 (`e623dc1`, exact-head CI SUCCESS 15/15 after a migration-list fix, post-merge CI `38715472930` SUCCESS): P10-D1 replay ledger (migration 017 replay_sessions/replay_events; consented sessions, strict envelopes, pre-storage redaction, ordering, close lifecycle, budgets with zero-write rejection incl. 2000-event exhaustion; 7 tests; rehearsal symmetric). First exact-head run caught the hardcoded migration-list assertions (extended to 017, ledger count 16->17). Reviews: genuine Jev ok:true with reverted-savepoint note, OCR delegate-only zero blocking, PStack fallback, Graft green.
- PR #127 (`afd699d`, exact-head CI SUCCESS 15/15, post-merge CI `38719703136` SUCCESS): P10-D2 replay transport (four session verbs as MCP tools plus REST/API routes with deep-equal envelopes; inventory 26->30; validator URI set and skill step; transport parity 2/2). No ledger change; no live capture. Reviews: genuine Jev ok:true with two pre-commit fixes, OCR delegate-only zero blocking, PStack fallback, Graft green.
- PR #128 (`068956e`, exact-head CI SUCCESS 15/15, post-merge CI `38722581990` SUCCESS): P10-D3 replay playback (`/flows` replay-sessions section over the qualified read with recorded-order stepping; 6 flows-ui source tests). No backend change; no live capture. Reviews: genuine Jev ok:true with repaired-collision note, OCR delegate-only zero blocking, PStack fallback, Graft green.
- Reconciliation note (2026-10-15, base `068956e`): 8 implementation grains advanced P10/P14 rows without flipping literal statuses, because every remaining gap is an authorized deferral (live capture, Mobbin, screen gallery wording, genuine-binary proof, embeddings, watch/scoring, Apps views, prod-scale ops) rather than unscoped work. Coverage stays 14/25 VERIFIED (56.0%) for the same reason as the PR #120 note; progress is recorded in this delta log and the scope-disposition records, not in the percentage.
- PR #130 (`96f4536`, exact-head CI SUCCESS 15/15, post-merge CI `38728123860` SUCCESS): P15-1 abuse-alarm evaluator (pure deterministic triage over denial streams with workspace attribution, transcribed from SLOS/runbook; 6 tests). No route/schema/migration/permission change; managed alerting stays deferred. Reviews: genuine Jev ok:true, OCR delegate-only zero blocking, PStack fallback, Graft green.
- Full-system qualification rerun (`AF-12_FINAL_RERUN_2.md`, base `96f4536`): zero failures — lint/typecheck 11/11, python 221/221, web/worker 156/156, assets 35/35, ingest 14/14, providers group 39/39, adapters 69 pass + 1 genuine-binary skip, lens 197/197, db non-PG 146/146, real PG 15/15, all validators plus SBOM-check plus hygiene PASS, 1 remaining audit advisory under accepted risk, web build plus SMOKE_OK plus STARTER_CONSUMER_OK plus REGISTRY_INSTALL_PROOF_OK, graft green. Same honest limitations as the `8027264` record; not a standalone release declaration.
- Genuine OpenPencil binary qualification (`OPENPENCIL_BINARY_QUALIFICATION.md`, base `6d318a8`): docs-only grain exercising the committed headless adapter against a bun-built genuine binary at pin `78355fd` (0.16.0, MIT) — six allowlisted file-mode ops (`tree`/`node`/`query`/`info`/`export`/`convert`), `.pen`/`.fig` handling, pack-to-pen-to-export-to-reopen journey, fig round-trip — with 20/20 adapter tests passing under `SKELET_OPENPENCIL_BIN` (vs 19+1 skip without). No code fix required. Closes the P14/AC-03 genuine-binary gap; `.fig` fidelity at scale stays per-document and PageDraw stays deferred.
- P10 live capture disposition (`P10_CAPTURE_DISPOSITION.md`, base `368700c`): docs-only grain separating the qualified rrweb-compatible representation (ledger with redaction/budgets, four session verbs, flow-player stepping) from the deferred live capture client (no rrweb dep, no recorder call in tree) with owner-consent plus redaction-proof plus Chromium-test triggers, machine-checked by `tests/test_p10_capture.py` (3 tests; python suite now 224/224). P10 stays PARTIAL until the recorder lands; Mobbin normalization and screen-gallery wording remain separate follow-ons.
- P15-2 operator abuse-alarm CLI (`scripts/check_abuse_alarms.mjs`, base `f23b9b5`): executable runbook triage with exit-coded assessment (0 ok, 1 elevated, 2 critical, 3 invalid) over JSONL event files within byte/line budgets, proven by `apps/web/tests/abuse-alarms-cli.test.mjs` (5 spawned-CLI tests). No route/schema/migration/permission change; managed alerting stays deferred.
- Full-system qualification rerun 3 (`AF-12_FINAL_RERUN_3.md`, base `aca627b`): zero failures — lint/typecheck 11/11, python 224/224, web/worker 161/161, assets 35/35, ingest 14/14, providers group 39/39, adapters 69 pass + 1 genuine-binary skip, lens 197/197, db non-PG 146/146, real PG 15/15, all validators plus SBOM-check plus hygiene PASS, 1 remaining audit advisory under accepted risk, web build plus SMOKE_OK plus STARTER_CONSUMER_OK plus REGISTRY_INSTALL_PROOF_OK, graft green. Same honest limitations as the `96f4536` record; not a standalone release declaration.
- AC-00 bundle baseline (`BUNDLE_BASELINE.md`, base `b5e9fd9`): measured client-bundle rollback criterion for Issue #62 gate 4 — shared First Load JS 103 kB, heaviest route 106 kB, budgets 120/140 kB enforced by `scripts/check_bundle_budget.mjs` on the CI `web` job's own build output (no second build), proven by `tests/node/bundle-budget.test.mjs` (4 offline tests). No product code change; Web Vitals lab work stays out of scope.
- P10 normalization note (`P10_NORMALIZATION_NOTE.md`, base `46c30b2`): authoritative wording closing the Mobbin-normalization and screen-gallery follow-ons — Skelet-owned Flow/FlowStep/Artifact plus importer plus taxonomy/gallery/player vehicle, mobbin-mcp reference-only (planned, unpinned, zero imports), screen-wall honestly a non-requirement per plan line 753 — machine-checked by `tests/test_p10_normalization.py` (3 tests; python suite now 227/227). No product code change; P10 stays PARTIAL until the capture recorder lands.
- P15-3 release signing procedure (`docs/operations/RELEASE_SIGNING.md`, base `814a2e4`): executable fail-closed ceremony via `scripts/sign_release_artifact.mjs` (operator sign-plus-verify; ephemeral self-test proving the path with cleanup), proven by `tests/node/release-signing.test.mjs` (2 tests). Test signatures honestly not release identities; production key ceremony stays owner work.
- P15 legal surfaces (`apps/web/app/privacy|terms|support`, base `5cdd3bc`): static user-facing privacy/terms/support pages (174 B each, shared 103 kB intact) with home footer links, proven by `apps/web/tests/legal-surfaces.test.mjs` (3 source tests). No data/backend change; formal commercial terms stay owner work.
- P15 concurrent-load bench (`scripts/bench_concurrent.mjs`, base `f396e0c`): parallel lexical-search robustness proof — 50/50 requests succeed with results under 10-way load (p50 71.5 ms, p95 104.4 ms, PGlite environment-relative), proven by `tests/node/bench-concurrent.test.mjs` (2 tests). No product code change; production/hosted scale stays unproven.
- Full-system qualification rerun 4 (`AF-12_FINAL_RERUN_4.md`, base `70da1ba`): zero failures — lint/typecheck 11/11, python 227/227, web/worker 170/170 (batched locally with the combined-glob local limit disclosed; CI runs the same glob combined), assets 35/35, ingest 14/14, providers group 39/39, adapters 69 pass + 1 genuine-binary skip, lens 197/197, db non-PG 146/146, real PG 15/15, all validators plus SBOM-check plus hygiene PASS, signing self-test and bundle check PASS, 1 remaining audit advisory under accepted risk, web build plus SMOKE_OK plus STARTER_CONSUMER_OK plus REGISTRY_INSTALL_PROOF_OK, graft green. Same honest limitations as prior records; not a standalone release declaration.
- Review-stack migration (founder decision `GD-2026-10-21-REVIEW-STACK`, `docs/governance/DECISION_2026-10-21_REVIEW_STACK_MIGRATION.md`): the mandatory TypeSafe Jev gate is waived; the PStack review panel becomes the mandatory review gate. Prospective row edits only — the R7 "Tests:" inventory is forward-looking and reads "per-grain PStack/OCR/Graft records under `docs/reviews/`", with the historical `*_JEV_REVIEW.*` files named there as evidence of what ran at the time; new grains add `*_PSTACK_PANELS.md` and produce no new Jev files. The P15/R7 acceptance criteria and global gate (5) now name "PStack-panel/OCR" in place of "Jev/OCR". Every per-pull-request historical entry above is preserved verbatim; its Jev mentions remain historical statements, not current gates. No product code, contract, schema, migration, dependency, brand asset, release or deployment change.

---

## Audit Limitations

- This matrix is a documentation audit on HEAD `543641a`. It implements no product code and closes no P0 risk by itself.
- Counts above derive from row statuses in this file, not from test-suite pass counts. Suite totals cited (e.g. Python 170, lens 197) are historical AF-12i measurements to be re-run on the final release candidate; they are not re-verified by this document.
- Real upstream adapter binary compatibility remains UNVERIFIED as of the `543641a` audit; see Post-Audit Deltas for the VectorCraft and PhotoCraft genuine-binary qualifications that supersede this line. Fixture-tested adapters must never be cited as upstream proof.
- Alibaba OCR delegate-only results are non-LLM delegations, not independent model-backed reviews, per every `*_OCR_DELEGATION.md`.
- PStack evidence to date is fresh-context manual review explicitly labeled as fallback, not genuine tool execution, where the binary was unavailable.
- Managed SaaS, production R2/S3 at scale, enterprise SSO/SCIM, and GPU paths are out of scope for the supported zero-founder-spend local/self-hosted core and were not exercised.
