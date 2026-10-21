# Skilit Implementation Plan

Status: CANONICAL IMPLEMENTATION PLAN — implementation-ready
Repository: https://github.com/TheHalfMoon/Skilit
Product thesis: Skilit is the design intelligence layer for humans and AI agents.
Commercial thesis: paid plans should target approximately 50% of the equivalent Mobbin plan price, while product differentiation must come from agent-native design intelligence rather than discounting.

## 1. Product Contract

Skilit MUST treat AI agents as first-class users. Anything discoverable by a human in the Skilit web UI MUST have a stable structured representation that can be retrieved through the API/MCP layer.

Primary product surfaces:
1. Research: products, versions, websites, screens, flows, patterns, copy, references.
2. Assets: icons, logos, fonts, components, illustrations, reusable resources.
3. Lens: paste a URL or image and return a structured design intelligence pack.
4. Agents: Remote MCP, MCP Apps, agent skills, REST API, TypeScript SDK, Python SDK, CLI.
5. Create: reference-to-editable-design workflows backed by OpenPencil; post-core launch unless core readiness is already met.

Launch-critical user journeys:
- Search across screens, flows, websites, components, icons, logos, fonts, and patterns from one query box.
- Paste a URL and receive screenshots, page/section structure, design tokens, brand assets, technology clues, QA findings, and agent-ready context.
- Connect an AI agent and perform search, inspect, compare, save, and create-reference-pack workflows without using the Skilit web UI.
- Save research to collections/workspaces and resume it from another agent/client.
- Retrieve assets with source, provenance, rights metadata, variants, and machine-usable formats.

Launch non-goals:
- Rebuilding Figma or a canvas engine.
- Building a mobile device farm before imported/permitted mobile corpus and web capture prove demand.
- Mandatory paid LLM inference.
- Mandatory paid crawler, vector SaaS, search SaaS, GPU, or cloud service.
- A generic web scraper product unrelated to design intelligence.

## 2. Architectural Principles

- Modular monolith first. Split services only after measured scaling pressure.
- PostgreSQL is the canonical transactional and graph-adjacency store.
- Binary media is content-addressed and stored outside Git.
- Search is provider-backed behind stable interfaces; no UI route depends directly on Orama, pgvector, or any external search vendor.
- Imported source code and imported datasets are governed separately.
- Every imported record is idempotent, provenance-bound, and traceable to an exact source identity.
- Every external provider is an adapter with explicit input/output contracts and timeouts.
- External AI egress is opt-in; local/deterministic analysis is the default.
- Agent interfaces are versioned public contracts, not wrappers around internal implementation details.
- Untrusted URLs, HTML, SVG, and uploaded files execute in isolated workers with no ambient credentials.

## 3. Canonical Domain Model

Canonical entities:
- Source: donor/provider/capture origin and rights/provenance identity.
- Product: app, website, service, brand, or product being studied.
- ProductVersion: immutable version/capture boundary for a Product.
- Artifact: common searchable design object.
- Asset: content-addressed binary or text asset.
- Flow: ordered user journey bound to a ProductVersion.
- FlowStep: ordered step referencing an Artifact and optional interaction/hotspot.
- Pattern: normalized UX/UI pattern taxonomy entry.
- Relation: typed directed edge between canonical objects.
- Collection: user/workspace research set.
- CaptureRun: one bounded ingestion/capture execution.
- AnalysisRun: deterministic or model-backed enrichment execution.
- ImportRecord: external source ID -> canonical Skilit ID mapping.

Artifact kinds at launch:
- screen
- page
- section
- component
- icon
- logo
- font
- illustration
- resource
- brief
- design

Required Artifact fields:
- id: UUIDv7
- kind
- product_id nullable
- product_version_id nullable
- title
- summary nullable
- canonical_text nullable
- metadata JSONB
- source_id
- source_record_id nullable
- captured_at nullable
- created_at
- updated_at
- content_hash
- rights_classification
- visibility

Required Asset fields:
- id
- sha256
- media_type
- byte_length
- width/height/duration nullable
- storage_key
- source_url nullable
- source_id
- rights_classification
- metadata JSONB

Required Relation fields:
- from_type/from_id
- relation_type
- to_type/to_id
- confidence nullable
- evidence JSONB nullable

Initial relation types:
contains, belongs_to, uses, derived_from, visually_similar_to, semantically_similar_to, appears_in, follows, precedes, variant_of, extracted_from, references.

Do NOT create separate canonical databases for icons, components, screens, and websites. Typed extension tables may be introduced only for fields that become performance-critical or require relational integrity beyond JSONB.

## 4. Runtime Architecture

Initial deployable units:
1. web: Next.js application containing human UI, REST API, Remote MCP endpoint, MCP App resources, auth, billing, collections, search orchestration, and read-side APIs.
2. worker: Node.js worker process for capture, imports, analysis, embeddings, document processing, and scheduled refresh jobs.
3. PostgreSQL: canonical records, users/workspaces, job state, search metadata, full-text search, and pgvector embeddings.
4. Object storage: local filesystem adapter in development; S3-compatible/R2 adapter in production.

Avoid Redis at launch. Use a PostgreSQL-backed queue (pg-boss or equivalent) so jobs participate in one operational database and can be replayed/audited.

Repository target structure after the initial upstream snapshot is qualified:

apps/
  web/
  worker/
packages/
  domain/
  db/
  search/
  storage/
  provenance/
  providers/
  mcp/
  registry/
  testkit/
scripts/
  imports/
  capture/
  provenance/
docs/
  architecture/
  product/
  provenance/
  operations/
fixtures/

Use pnpm workspaces. Do not introduce Turborepo unless build measurements show a material need.

## 5. Provider Boundaries

Base/selective upstream:
- Monet Registry: website/component registry engine, page/section metadata concepts, capture/search/build scripts. Import selectively, exclude bulk media and product-owned branding/data not required by Skilit.

Transplant/adapters:
- OpenSourceUI: catalog UX, component preview patterns, quality checks, selected component data.
- Better Auth/PaceKit: authentication UX/flows; database remains Skilit PostgreSQL.
- Better Auth Stripe plugin: subscription/customer/team-seat lifecycle.
- Iconify: normalized icon collections and metadata.
- Simple Icons/SVGL/authorized logo datasets: brand/logo corpus.
- Fontsource: font metadata/assets where redistribution rights allow.
- shadcn registry specification: canonical component distribution contract.
- Dembrandt: design-token/design-system extraction provider.
- OpenBrand: brand/logo/color extraction provider.
- OpenTechAlyzer: technology detection provider.
- Squirrelscan: website QA/history provider where useful.
- rrweb: compact web-flow recording/replay.
- Maestro: later mobile flow automation provider.
- OmniParser + local OCR: screenshot/UI parsing worker for image-only artifacts.
- OpenPencil: Create/editor provider after core launch readiness.
- Docling: document/brand-guide ingestion worker.
- Firecrawl: fallback crawler only when native capture is insufficient.

Every provider MUST implement:
- capability identifier
- version/source pin
- deterministic configuration record
- timeout and cancellation
- input schema
- output schema
- provenance emission
- error classification
- health check
- optional cost/egress classification

## 6. Ingestion Contract

All imports and captures flow through one normalized pipeline:

source -> raw record -> canonical normalization -> asset dedupe -> provenance validation -> enrichment -> search indexing -> publish

Rules:
- Raw payloads are retained only when permitted and useful for replay/debugging.
- ImportRecord provides idempotency with source_id + external_id + source_version uniqueness.
- Asset bytes are deduplicated by SHA-256 before upload.
- A failed enrichment MUST NOT corrupt or partially publish the canonical object.
- Publish is a final state transition after required validators pass.
- Re-importing identical content MUST be a no-op except for audit timestamps.
- Importers MUST expose dry-run mode and deterministic fixture tests.

## 7. Search Architecture

One public search contract serves humans, REST clients, and MCP clients.

Initial engines:
- PostgreSQL full-text search for canonical text, OCR, names, tags, and metadata projections.
- pgvector for text/image embeddings and nearest-neighbor retrieval.
- Existing Monet/Orama logic may remain temporarily behind an adapter during migration, but must not become a second canonical search contract.

SearchDocument projection:
- object_id/object_type
- title
- searchable_text
- product/category/platform
- tags/patterns/elements
- colors/style/layout/industry facets
- rights/visibility
- popularity/quality/freshness signals
- text_embedding
- visual_embedding nullable

Ranking v1:
- lexical relevance
- semantic similarity
- visual similarity when image query exists
- quality score
- provenance completeness
- freshness
- user/workspace context only when explicitly allowed

Search MUST support:
- text -> any artifact
- image -> visually similar artifacts
- artifact -> similar artifacts
- typed filters
- product/version scoped search
- flow/pattern search
- asset/license filtering

## 8. Skilit Lens

Input: URL or uploaded image.

URL analysis pipeline:
1. URL canonicalization and SSRF validation.
2. Isolated Playwright/Monet capture.
3. Screenshot + DOM + sections + asset inventory.
4. Dembrandt token/design-system extraction.
5. OpenBrand brand/logo/color extraction.
6. OpenTechAlyzer technology detection.
7. Optional Squirrelscan QA/a11y/SEO/security report.
8. Local OCR/OmniParser only for image-only/opaque regions that DOM analysis cannot explain.
9. Embedding generation.
10. Canonical Product/ProductVersion/Artifact graph publication.
11. Agent Context Pack generation.

Lens output contract:
- overview
- screenshots/pages/sections
- colors/typography/spacing/radius/shadows/motion
- logos/icons/images/fonts
- detected components/patterns
- technology clues with confidence/source
- QA findings
- provenance
- similar Skilit references
- exports: JSON, DESIGN.md, DTCG tokens, Tailwind theme, shadcn theme when supported, agent-context JSON

Lens MUST clearly distinguish observed facts, deterministic inference, heuristic inference, and model-generated interpretation.

### 8.1 Lens Build Kit successor (P09b, normative; tracks issue #9)

The Lens report (§8) is extended by a bounded successor phase **P09b — URL to ready-to-build implementation kit**, which turns a qualified Lens analysis into a downloadable, agent-usable build starter. P09b is an additive capability of Skilit Lens, not a new editor, app builder, or clone of the analyzed site's proprietary source.

Build Kit execution contract:
- Stable `AnalysisRun`/kit identifiers; idempotent submission; poll, cancel, retry, and resume operations; artifact expiration; tenant-scoped storage and access; per-job quota accounting; versioned schemas; deterministic error classification.
- Explicit job states: queued, capturing, extracting, generating, validating, completed, partial, failed, canceled. Never return a successful empty artifact.
- Bounded capture scope: single public page by default; explicitly selected same-site pages or bounded sitemap crawl only, under configured page/depth/byte/time budgets. Preserve per-page coverage gaps instead of claiming complete-site coverage.
- Generated code is expressly distinguished from the original application source; unknown server logic and interactive behavior are explicit stubs. The generated starter MUST install and build from a clean checkout.
- Per-item rights classification: restricted, trademarked, or unknown-license bytes MUST NOT enter downloadable artifacts. Support withdrawal, deletion, and derivative/cache purge.
- No mandatory paid inference, paid crawler, GPU, or external model for the deterministic minimal path; graceful partial results on provider outage.
- P09b is a successor to qualified Lens capture (R4 gate and basic Lens report MUST be complete first). P14 Create/OpenPencil is explicitly NOT a prerequisite, and the kit MUST NOT depend on it.

Build Kit layout and schemas are frozen by the P09b implementation grains before code lands; P15 commercial launch acceptance explicitly includes the URL-to-Build-Kit journey. This planning amendment alone does not implement the feature and closes no P0 implementation risk.

## 9. Agent Platform Contract

Canonical remote endpoint:
- /mcp over Streamable HTTP.

Public resources use stable URIs:
- skilit://product/{id}
- skilit://version/{id}
- skilit://artifact/{id}
- skilit://flow/{id}
- skilit://collection/{id}
- skilit://lens/{analysis_id}
- skilit://reference-pack/{id}

Keep the tool surface small and composable. Launch tools:
- search_design: unified search with kind/facet/query/image/reference filters.
- get_object: retrieve structured canonical objects by Skilit URI or ID.
- find_similar: semantic/visual/pattern similarity.
- compare_design: compare products, versions, artifacts, or flows with evidence references.
- analyze_url: create or retrieve a Lens analysis.
- analyze_image: ingest/analyze an uploaded screenshot or design image.
- resolve_asset: return machine-usable asset variants plus rights/provenance.
- save_reference: save an object to a collection/workspace.
- create_reference_pack: create compact agent context from selected evidence.
- get_changes: retrieve version/capture differences for a Product.
- search_registry: search Skilit's shadcn-compatible component registry.

Do not expose one MCP tool per internal micro-operation. The agent contract should model user intent, while internal providers remain implementation details.

MCP Apps launch views:
- search gallery
- flow player
- visual compare
- icon/logo picker
- Lens Design DNA report
- reference board

Agent Skills:
- skilit-research: research real shipped references before proposing UI.
- skilit-assets: select icons/logos/fonts/components with rights metadata.
- skilit-lens: analyze a URL and generate implementation context.
- skilit-reference-pack: persist/reuse evidence across agents.

All agent outputs MUST reference Skilit IDs/URIs so a later agent can recover the source evidence without relying on prose copied into chat history.

## 10. Assets and Registry

Assets surface is launch-critical, not a secondary directory.

Icon pipeline:
- ingest normalized metadata from Iconify-compatible collections.
- preserve collection/source/license metadata.
- generate searchable semantic aliases without changing source attribution.
- support SVG delivery and optional PNG/rendered variants.

Logo pipeline:
- imported brand-logo datasets + OpenBrand extraction.
- record trademark/brand-guideline URL separately from code/content license.
- maintain light/dark/monochrome/mark/wordmark variants when known.

Font pipeline:
- normalized family/style/weight/variable/license metadata.
- do not serve restricted font files merely because metadata can be indexed.

Component pipeline:
- Skilit publishes a shadcn-compatible registry.
- donor components are normalized to registry items only when dependencies and source/provenance are known.
- component metadata links to real shipped references when available.
- registry items include clear agent-oriented descriptions and dependency metadata.

## 11. Security, Privacy, and Abuse Boundaries

URL capture security:
- reject file:// and non-http(s) schemes.
- resolve DNS before navigation and block loopback, link-local, private, carrier-grade NAT, metadata-service, and reserved ranges.
- revalidate every redirect target and protect against DNS rebinding.
- run browsers in isolated workers with no production session cookies, cloud credentials, SSH keys, or filesystem secrets.
- enforce page timeout, download byte limits, navigation count limits, concurrency limits, and browser process memory/CPU bounds.
- sanitize/contain SVG and HTML previews; never render untrusted markup in a privileged same-origin application context.

MCP/API security:
- OAuth/session-backed user authorization for remote MCP.
- workspace-scoped permissions.
- rate limits and quotas by plan/capability.
- read-only tools by default; writes require authenticated workspace authority.
- logs MUST redact tokens, cookies, API keys, and uploaded secrets.
- BYOK model keys are never returned to clients after storage and are never included in observability payloads.

Data/AI privacy:
- deterministic/local analysis is default.
- external model calls require an explicit provider configuration and egress classification.
- every external analysis run records provider/model, input classes, cost estimate when available, and retention policy.
- private workspace content must never enter global ranking/training/corpus enrichment without explicit permission.

## 12. Provenance and Rights

Maintain separate files/tables for code provenance and data provenance.

UPSTREAMS.lock.yml fields:
- id
- source_url
- exact_commit_or_release
- role: base/transplant/adapter/dataset/reference
- imported_paths or capability
- permission_basis
- license
- modifications
- verification_date

DATA_PROVENANCE records:
- dataset/source identity
- owner/provider
- permission scope
- redistribution allowed/forbidden/unknown
- derivative metadata allowed/forbidden/unknown
- asset serving policy
- trademark/brand restrictions where applicable
- import batch IDs

No donor branch name is sufficient evidence. Every implemented import binds to an exact immutable commit/release/content hash verified at execution time.

## 13. CI and Review Gates

Every implementation PR must bind evidence to its exact PR HEAD.

Required automated gates:
- format/lint
- TypeScript typecheck
- unit tests
- database migration validation
- schema compatibility tests
- importer idempotency tests
- provider contract tests
- SSRF/security regression tests for URL capture
- auth/workspace authorization tests
- MCP JSON schema/contract tests
- REST API contract tests
- Playwright critical-path E2E
- build
- provenance lock validation
- generated registry validation
- no committed large/binary corpus gate

Review gates:
- PStack review panel over the exact diff with independent fresh-context judges (correctness, parsimony, product, security), or an explicitly recorded degraded review at a level the founder decision permits.
- Alibaba Open Code Review exact-HEAD review where available.
- zero unresolved blocking findings before merge.

Merge policy:
- ordinary merge commits only.
- no force-push.
- no rebase/history rewriting on governed branches.
- post-merge main verification is required before the grain is marked canonical.

## 14. Execution Program

### P00 — Governance and Upstream Lock
Deliverables:
- PRODUCT.md with agent-first contract and launch/non-goals.
- ARCHITECTURE.md with modular-monolith decision.
- UPSTREAMS.lock.yml schema and initial donor inventory.
- CODE_PROVENANCE.md and DATA_PROVENANCE.md.
- SECURITY.md with URL-capture/MCP threat boundaries.
- CI skiliton and branch governance.
Exit criteria:
- Skilit repo has a canonical first commit.
- every planned donor has role/permission/license placeholders and execution-time pin rule.
- no runtime donor code imported yet.

### P01 — Monet Selective Baseline Import
Steps:
- verify live Monet upstream state and exact immutable commit.
- create import manifest before copying.
- import only required source/config/scripts/tests; exclude bulk media, generated corpus, product branding, deployment assumptions, and secrets.
- preserve upstream notices/provenance.
- rename project-owned identity to Skilit without blind replacement of third-party identifiers.
- qualify install, lint/typecheck/tests/build.
Exit criteria:
- Skilit builds from its own repo.
- imported files are provenance-bound.
- baseline behavior is reproducible from a clean checkout.

### P02 — Repository Reshape and Local Dev Stack
Deliverables:
- pnpm workspace layout.
- apps/web and apps/worker.
- packages/domain, db, storage, provenance, providers, testkit.
- local PostgreSQL dev configuration and object-storage filesystem adapter.
- environment schema/validation.
Exit criteria:
- no intended product behavior change from P01.
- web and worker run independently from one checkout.
- clean reset/bootstrap command documented and tested.

### P03 — Canonical Domain + Persistence
Deliverables:
- migrations for Source, Product, ProductVersion, Artifact, Asset, Relation, Flow, FlowStep, Pattern, Collection, CaptureRun, AnalysisRun, ImportRecord.
- content-addressed asset service.
- canonical repository/service layer.
- source/external-ID idempotency constraints.
- seeded deterministic test fixtures.
Exit criteria:
- CRUD and relation traversal integration tests pass.
- duplicate import fixture produces no duplicate canonical objects/assets.
- provenance is mandatory for published imported artifacts.

### P04 — Auth, Workspaces, Billing Skiliton
Deliverables:
- Better Auth integration.
- workspace/organization roles.
- collections and saved references.
- Stripe plugin wired behind feature/config gate.
- Free/Pro/Team capability model independent of hard-coded price values.
Exit criteria:
- user can sign up/sign in, create/join workspace, create collection, save a reference.
- authorization tests prove cross-workspace isolation.
- billing webhooks are signature-verified and replay-safe in test fixtures.

### P05 — Ingestion Framework + Jobs
Deliverables:
- provider interface and registry.
- PostgreSQL-backed queue.
- CaptureRun/AnalysisRun lifecycle and retries.
- dry-run imports, dead-letter handling, cancellation, concurrency limits.
- object-store upload/dedupe pipeline.
Exit criteria:
- one fixture source imports end-to-end through queue -> canonical graph -> asset store -> publish.
- repeated import is idempotent.
- failed enrichment does not partially publish.

### P06 — Assets v1
Deliverables:
- Iconify-compatible icon importer/search.
- Simple Icons/SVGL-authorized logo importer.
- Fontsource metadata importer.
- OpenBrand adapter.
- unified Assets UI and API.
- rights/license/trademark filters.
Exit criteria:
- one search query can return icons, logos, and fonts using a shared contract.
- every returned downloadable asset has provenance and an explicit serving policy.
- MCP/API can resolve machine-usable SVG/font metadata without scraping the web UI.

### P07 — Component Registry
Deliverables:
- shadcn-compatible Skilit registry endpoint and registry index.
- Monet/OpenSourceUI/PaceUI import adapters for permitted components.
- dependency/provenance metadata and live preview.
- registry contract tests.
Exit criteria:
- shadcn MCP can discover Skilit registry items without a Skilit-specific client plugin.
- a clean sample app can install a qualified Skilit component and build successfully.

### P08 — Agent Platform v1
Deliverables:
- Remote MCP endpoint with authenticated Streamable HTTP.
- stable Skilit URI resource scheme.
- launch tool set: search_design, get_object, find_similar, analyze_url, analyze_image, resolve_asset, save_reference, create_reference_pack, search_registry.
- Agent Skill packages for research/assets/lens/reference-pack.
- REST /api/v1 parity for core read capabilities.
Exit criteria:
- at least three independent MCP clients can connect using the same server contract.
- an agent can search an icon, inspect provenance, save it, and create a reference pack end-to-end.
- tool schemas have compatibility snapshots.

### P09 — Lens v1
Deliverables:
- safe URL intake/SSRF controls.
- isolated Playwright/Monet capture worker.
- Dembrandt, OpenBrand, OpenTechAlyzer adapters.
- optional Squirrelscan report adapter.
- Design DNA projection and exports.
Exit criteria:
- paste a public URL -> reproducible Lens report with screenshot, DOM sections, colors, type, spacing, logos/assets, tech clues, provenance, and agent-context export.
- malicious/private-network URL test corpus fails closed.
- no external LLM is required for the qualified path.

### P09b — Lens Build Kit (URL to ready-to-build kit; tracks issue #9)
Depends: P09 Lens capture/report qualified (R4 gate), plus P03 canonical graph and P05 job lifecycle via P09.
Deliverables:
- versioned Build Kit schemas and fixture-validated ZIP layout (manifest, analysis pages/sections/components, DTCG tokens, CSS/Tailwind/shadcn themes, rights-classified asset inventory, screenshots, editable React/Next.js + Tailwind starter, provenance, AGENT.md task pack);
- AnalysisRun/kit job lifecycle with queued/capturing/extracting/generating/validating/completed/partial/failed/canceled states, idempotent create, poll/cancel/retry/resume, expiry, tenant scoping, and quota accounting;
- UI, REST, MCP, CLI/SDK parity over stable analysis/kit IDs and `skilit://lens/{analysis_id}` URIs, so a second agent can recover the same kit without the original session.
Exit criteria:
- rights-cleared 3-page fixture produces desktop/mobile captures, deterministic tokens, component inventory, source-linked evidence, schema-valid ZIP, and a generated starter that installs, typechecks, builds, starts, and passes responsive/keyboard smoke on a clean checkout;
- restricted assets are excluded from downloadable artifacts; SSRF/redirect/DNS-rebinding, prompt-injection, tenant-leakage, path-traversal, quota, cancellation/retry, and provider-outage tests pass;
- no mandatory paid inference or P14 Create dependency on the qualified path.

### P10 — Research Corpus + Flows
Deliverables:
- authorized app/site/screen/flow import adapters.
- Mobbin-learned screen/flow/hotspot normalization without a runtime dependency on Mobbin services.
- product/version UI, screen gallery, flow player, pattern taxonomy.
- rrweb representation for newly captured web flows.
Exit criteria:
- imported screens and flows coexist with web pages/components/assets in one graph.
- flow steps can reference screenshots, hotspots, actions, and optional replay/video evidence.
- imported corpus remains usable when every donor network endpoint is disabled.

### P11 — Multimodal Search + Similarity
Deliverables:
- unified SearchDocument projection.
- PostgreSQL FTS + pgvector indexing.
- local text/visual embedding worker using a pinned open model such as SigLIP2-compatible vision/text embeddings.
- hybrid ranking and typed filters.
Exit criteria:
- text -> screen/component/icon search.
- screenshot -> visually similar screen/component search.
- artifact -> similar artifact search.
- relevance benchmark fixture with acceptance thresholds is checked into the repo.

### P12 — MCP Apps + Research Memory
Deliverables:
- MCP App views for gallery, flow player, compare, asset picker, Lens report, reference board.
- project/reference-pack persistence inspired by proven local artifact workflows.
- evidence compaction format for agents.
Exit criteria:
- supported MCP App client renders interactive Skilit UI from the remote server.
- another agent can consume a saved reference pack and recover every evidence object by Skilit URI.

### P13 — Time Machine + Change Intelligence
Deliverables:
- scheduled/explicit recapture policy.
- page/screenshot/token/text/flow diff pipeline.
- normalized change events and meaningful-change scoring.
- watch/get_changes API/MCP capability.
Exit criteria:
- two ProductVersions produce evidence-linked change events without relying on model-generated prose.
- cosmetic/noise changes can be distinguished from structural/product-flow changes by deterministic signals plus optional enrichment.

### P14 — Create Beta via OpenPencil
Entry gate: P08-P12 core agent/research surfaces are stable and launch-quality.
Deliverables:
- reference pack -> OpenPencil document adapter.
- editable design generation workflow using OpenPencil APIs/MCP rather than a new canvas engine.
- .fig/.pen export/import where supported.
- design token handoff.
Exit criteria:
- user/agent can turn a qualified Skilit reference pack into an editable design document.
- OpenPencil integration is isolated behind an adapter so Create can evolve independently.

### P15 — Commercial Launch Qualification
Deliverables:
- pricing/capability enforcement.
- production R2/S3 adapter.
- operational dashboards, rate limits, abuse controls, backups, restore drill.
- production migration/runbook.
- privacy/terms/support surfaces.
- load tests for search, Lens queue, media delivery, and MCP.
Exit criteria:
- restore drill succeeds.
- launch SLOs and alert thresholds are documented.
- critical journeys pass E2E on production-like environment.
- no unresolved PStack-panel or OCR blocking findings.

## 15. Dependency Graph and Launch Cut

Hard dependencies:
P00 -> P01 -> P02 -> P03 -> P05
P03 -> P04
P05 -> P06 -> P07
P06 + P03 -> P08
P05 + P03 -> P09
P09 -> P09b (Build Kit successor; R4 Lens report and job lifecycle must be qualified first; P14 Create is not a prerequisite)
P03 + P05 -> P10
P06 + P07 + P09 + P10 -> P11
P08 + P11 -> P12
P09 + P10 + P11 -> P13
P08 + P11 + P12 -> P14
P04 + P06 + P08 + P09 + P09b + P10 + P11 + P12 -> P15

Commercial launch acceptance explicitly includes the URL-to-Build-Kit journey (paste a public URL, receive a reproducible, downloadable, agent-recoverable implementation kit whose generated starter installs and builds from a clean checkout).

Commercial launch MUST NOT be blocked by P13 Time Machine or P14 Create if the core launch journeys are qualified.

Minimum paid launch scope:
- unified search
- Assets: icons/logos/fonts/components
- Research: products/sites/screens/flows from qualified corpus
- Lens URL analysis and URL-to-Build-Kit export (P09b)
- collections/reference packs
- Remote MCP + skills + REST API
- auth/workspaces/billing
- provenance/rights display

Post-launch/beta scope:
- Create/OpenPencil
- automated mobile device farm
- broad continuous watch/Time Machine schedules
- enterprise SSO/SCIM
- hosted external LLM subsidy

## 16. Grain Execution Rules

Each implementation grain MUST contain:
- one bounded objective
- exact base SHA
- exact branch/head SHA
- explicit files/contract surface
- tests/evidence required before implementation starts
- implementation
- local qualification
- PStack review-panel report (independent or explicitly degraded)
- Alibaba OCR report where available
- PR exact-head CI
- ordinary merge commit
- post-merge main qualification
- canonical closeout record

Do not combine unrelated donor imports, database migrations, UI redesign, and agent contract changes in one grain.

## 17. Initial Launch SLO Targets

These are planning targets and must be benchmarked before launch:
- Search API p95: < 500 ms for cached/common queries; < 1.5 s for hybrid visual/semantic queries.
- MCP read tool p95 excluding heavy analysis jobs: < 1 s.
- Lens submission acknowledgement: < 1 s; heavy analysis is asynchronous with job state.
- Lens normal public-page completion target: < 60 s, with provider-level partial results instead of total failure when optional analyzers fail.
- asset metadata/API availability: 99.9% target after production launch.
- zero cross-workspace data exposure in authorization test matrix.

## 18. Product Success Metrics

Agent metrics:
- successful MCP sessions
- tool success/error rate
- search-to-evidence selection rate
- reference-pack creation/use rate
- repeat agent usage by workspace
- median number of Skilit evidence objects used per completed agent task

Human metrics:
- search -> artifact view
- artifact -> save/reference-pack
- URL -> Lens completion
- asset -> copy/download/install
- collection reuse

Commercial metrics:
- free -> paid conversion
- paid retention
- infrastructure cost per active workspace
- heavy-analysis cost per paid workspace

Quality metrics:
- search relevance benchmark
- provenance completeness
- duplicate rate
- broken asset rate
- stale capture rate
- importer replay success
- provider failure isolation rate

## 19. Stop/Defer Rules

Do not add a new vendor/provider when an existing qualified provider covers the same launch requirement unless benchmark evidence shows a material quality, cost, rights, or reliability advantage.

Do not build a custom subsystem when a permitted mature donor can satisfy the requirement behind an adapter without weakening the canonical Skilit domain.

Do not make Create, mobile device capture, or paid LLM inference a prerequisite for initial commercial launch.

Do not optimize for Mobbin feature parity at the expense of the agent-first contract. The launch criterion is that an agent can discover, understand, cite, save, and reuse design evidence better than through a screenshot-only library.

## 20. First Implementation Grains

The following is the default PR sequence. Each row is one governed merge unless implementation evidence proves it is too large, in which case split it without moving later dependencies earlier.

G00-01: Repository charter
- Depends: none
- Adds: PRODUCT.md, ARCHITECTURE.md, SECURITY.md, governance/merge rules.
- Proves: docs lint/links and no donor code.

G00-02: Provenance schemas
- Depends: G00-01
- Adds: UPSTREAMS.lock.yml schema, CODE_PROVENANCE.md, DATA_PROVENANCE.md, validation script.
- Proves: malformed/mutable-source entries fail validation.

G00-03: CI skiliton
- Depends: G00-01
- Adds: format/lint/typecheck/test/build placeholders, exact-head evidence convention, binary-size gate.
- Proves: deliberately broken fixture fails each gate.

G01-01: Monet import manifest
- Depends: G00-02
- Adds: execution-time verified Monet commit pin and explicit include/exclude path manifest only.
- Proves: immutable source identity and expected file inventory; no donor code yet.

G01-02: Monet source snapshot
- Depends: G01-01
- Adds: selected files exactly matching manifest.
- Proves: content hashes against upstream pin and preserved notices.

G01-03: Skilit identity + baseline qualification
- Depends: G01-02
- Changes: project-owned branding/config only; no architecture redesign.
- Proves: clean install, lint/typecheck/test/build, no unintended third-party identifier rewrite.

G02-01: Workspace reshape
- Depends: G01-03
- Moves: qualified web code into apps/web and establishes pnpm workspace.
- Proves: behavior/build equivalence before and after move.

G02-02: Worker shell + environment contract
- Depends: G02-01
- Adds: apps/worker, environment schema, health/ready endpoints or commands.
- Proves: web/worker start independently with no business jobs yet.

G03-01: Database foundation
- Depends: G02-02
- Adds: PostgreSQL adapter/migration runner and Source/Product/ProductVersion.
- Proves: migrate up from empty and recreate deterministic test database.

G03-02: Artifact/Asset/Relation schema
- Depends: G03-01
- Adds: Artifact, Asset, Relation, Pattern and content hash constraints.
- Proves: common artifact kinds and graph edges round-trip.

G03-03: Flow/Collection/Run/Import schema
- Depends: G03-02
- Adds: Flow, FlowStep, Collection, CaptureRun, AnalysisRun, ImportRecord.
- Proves: idempotent external mapping and ordered flow traversal.

G03-04: Object storage
- Depends: G03-02
- Adds: StorageProvider interface + local filesystem implementation + SHA-256 dedupe.
- Proves: duplicate bytes share canonical asset identity/storage object.

G04-01: Better Auth baseline
- Depends: G03-03
- Adds: auth/session tables and sign-up/sign-in/sign-out.
- Proves: session/auth integration tests.

G04-02: Workspaces and roles
- Depends: G04-01
- Adds: organization/workspace/member roles and authorization service.
- Proves: cross-workspace denial matrix.

G04-03: Collections
- Depends: G04-02
- Adds: collection create/read/update/delete and save-reference path.
- Proves: user can persist a canonical Skilit object reference.

G04-04: Billing adapter
- Depends: G04-02
- Adds: Better Auth Stripe plugin behind config/feature gate and capability plan model.
- Proves: signed webhook, replay handling, seats fixture; production prices remain configuration.

G05-01: Job queue lifecycle
- Depends: G03-03
- Adds: PostgreSQL-backed queue, job identity, cancellation, retry/backoff, dead-letter state.
- Proves: duplicate enqueue/retry/cancel fixtures.

G05-02: Provider contract
- Depends: G05-01
- Adds: provider schemas, timeout/cancellation, health, provenance, egress/cost classification.
- Proves: fake good/timeout/malformed providers.

G05-03: Publish transaction
- Depends: G05-02 + G03-04
- Adds: raw -> normalize -> asset dedupe -> validate -> publish pipeline.
- Proves: failed optional enrichment yields partial analysis status but no corrupt canonical publish; required validation failure publishes nothing.

After G05-03, P06+ work may run as parallel feature branches only when they do not modify the same public contract. Domain/API/schema changes remain serialized through normal merge commits.

Branch naming pattern: skilit/pXX-gYY-short-name.

## 21. Mandatory Security Qualification Matrix

URL/Lens tests MUST include:
- localhost/127.0.0.0/8 rejection.
- IPv6 loopback/link-local/private rejection.
- RFC1918/private-address rejection.
- cloud metadata endpoint rejection.
- public DNS resolving to private IP rejection.
- redirect from public URL to private/reserved target rejection.
- DNS rebinding simulation/revalidation.
- file:, data:, javascript:, ftp: and unsupported-scheme rejection.
- oversized response/download termination.
- redirect-loop/navigation-budget termination.
- page timeout and browser-process cleanup.
- hostile SVG/script preview isolation.
- capture worker environment test proving no production secrets are present.

Auth/MCP tests MUST include:
- anonymous read/write policy matrix.
- user A cannot read/write workspace B.
- user cannot forge workspace/reference IDs.
- write tools require explicit authenticated authority.
- expired/revoked session denial.
- rate-limit/quota enforcement.
- MCP/REST error bodies do not leak secrets/internal stack traces.
- provider/BYOK secrets are redacted from logs and result payloads.

External egress tests MUST include:
- deterministic Lens path succeeds with all external LLM providers disabled.
- private workspace content is not sent to an external model without explicit configured provider/permission.
- AnalysisRun records provider/model and egress classification when external inference is used.

## 22. Public Contract Versioning

Version independently:
- REST API: /api/v1; breaking changes require /api/v2 or a documented compatibility window.
- MCP tools/resources: semantic schema version recorded in server metadata; breaking tool input/output changes require new tool/resource version or compatibility adapter.
- Skilit URI identity is stable across API versions.
- registry schema follows the pinned shadcn registry specification and validates in CI.
- database schema is internal and may evolve through forward migrations; public APIs never expose table shapes as contracts.

Contract fixtures are stored in packages/testkit/contracts and diffed in CI. A change to a public schema MUST include an explicit compatibility classification in the PR.

## 23. 2026-10-08 Architecture Review — Normative Plan Hardening

This section is a **planning amendment**, not product implementation. It becomes canonical only after the governing PR is merged and its exact post-merge checks pass.

The core P00–P15 product vision remains unchanged, but the following execution corrections take precedence over earlier implementation-sequencing assumptions if they conflict:

1. **No runnable-Monet assumption.** The 90 Monet source files selected in G01-01 and classified in G01-02a are not a complete runnable Next.js product. G01-02 successor grains MUST import one dependency-closed, verified capability at a time; G01-03 MAY establish a clean Skilit-owned app shell instead of recreating excluded donor UI/branding. Bootstrap Python tests or an isolated copied TypeScript helper do not prove a working product.
2. **Progress by tested user journeys.** S0 must integrate rights-qualified icon/component ingestion, canonical persistence, search, human inspection, collection saving, reference-pack export, and REST/MCP recovery from another client before expanding to S1 safe URL Lens. This does not shrink the existing paid launch scope.
3. **Modern MCP contract.** Target the official 2026-07-28 MCP protocol with tested compatibility; OAuth metadata/audience binding/PKCE/issuer, Tasks extension and REST fallback, official MCP Apps SDK and explicit host support. Never assume MCP Apps or Tasks exist in every client.
4. **Strict rights and egress boundaries.** Dataset, screenshot, icon/font/logo, model and trademark rights are separate from donor source-code permission. Socket-level browser egress isolation and prompt-injection defenses are mandatory for Lens, beyond URL string checks. Takedown and derivative deletion are release requirements.
5. **Measured quality and costs.** Lexical search and local/offline path before optional embeddings. Relevance judgments, exact model/runtime pins, performance baseline, quotas, browser-minute/storage/egress cost attribution and commercial margin evidence precede scaling; no impossible promise of free public infrastructure.
6. **Clear product responsibilities.** Skilit owns research/evidence/asset registry and agent retrieval. Lilac/OpenPencil own edit/canvas; Kernux/Deskal provide qualified access capabilities only; Morize/Orcel/Gomrey/Ineractive are optional adapter/consumer relationships, not unverified runtime dependencies.
7. **Traceable readiness.** Every implementation grain maps to the R0–R7 gate and explicit capability state, and every P0 gap must be actually closed before the corresponding public feature/launch. A passing planning validator never substitutes for full application tests.
8. **Preserve governance.** Graft, the PStack review panel, Alibaba OCR/delegation, exact-HEAD GitHub CI, normal merges and verified post-merge closeouts remain non-waivable.

The detailed decisions, source matrix and prioritized acceptance ledger below are **normative companion documents** for any future implementation PR:

- [Architecture and Execution Decisions](architecture/PLAN_HARDENING_2026-10-08.md)
- [Ready Source / Donor Reuse Decisions](research/DONOR_REUSE_DECISIONS_2026-10-08.md)
- [Gap Register and Mandatory Acceptance](operations/PLAN_GAP_REGISTER_2026-10-08.md)

These documents authorize **planning and evaluation** only. They do not activate source material, update existing upstream locks, or claim any P01/P15 product completion.

## 24. 2026-10-11 Founder Direction — Agent-First, No Founder-Funded AI/Cloud

Status: PROPOSED planning amendment. This section becomes normative after its documentation PR has passed the existing exact-head review/CI and ordinary merge policy; it does not complete a runtime grain.

Founder clarifies: Skilit must maximize verifiable design-workflow value for **external AI agents** without Skilit hosting or financing model inference, GPU compute, paid search/vector SaaS, or cloud workloads. The user supplies their own agent/model and, for the zero-founder-compute product mode, runs Skilit on local/customer-hosted infrastructure. A public managed SaaS cannot claim zero infrastructure cost and is out of scope absent an approved unit-economic budget and quotas.

Implementation consequences:

1. All mandatory user journeys (research, Lens, Build Kit, rights-qualified assets, REST/MCP, collections/packs) must pass with no model API key, no GPU, and no paid cloud subscription. URL capture may contact authorized public target websites but no paid model service.
2. The existing P11 reference to pgvector and local text/visual embeddings is a **future opt-in enhancement** rather than a mandatory prerequisite for the no-model core or local self-hosted launch. PostgreSQL FTS, typed facets, deterministic metadata and perceptual/layout/color features supply the testable baseline; never falsely advertise these as full semantic embeddings. Optional customer-installed local embedding adapters require their own pinned model/rights/performance acceptance and CPU budget.
3. Restore P08/REST/MCP actor-specific object authorization before extending remote read surfaces; global sessions do not grant access to all artifacts. Enforce rights and workspace visibility at canonical retrieval, search, cache, preview, board, export and editor handoff boundaries.
4. Integrate ArtCraft/Craft capabilities *selectively*: P10 narrow local video frame capture; P12 collections-backed portable Moodboard; optional P14 headless VectorCraft/PhotoCraft or PageDraw primitives. No mandatory ArtCraft API, proprietary media services, GPU, full 3D/film suite, or second datastore. Donor file rights/provenance/commit pins remain separate from third-party assets, datasets, models and trademarks.
5. Default commercial delivery is local or customer self-hosted with deterministic quotas, no silent egress, recovery/upgrade support and optional offline commercial entitlements. A managed hosting offer is a separate future business decision.
6. Keep existing P00-P15 sequence, active grain frontier, P09b launch-critical status, R0-R7 gates, P0 gap register, PStack/OCR/Graft review, exact-head CI, normal merges and post-merge qualification. No completion claim arises from this amendment.

Detailed contracts, migration boundaries, cost/security matrices, acceptance tasks and AF-SEC-00 through AF-12 implementation grains are recorded in [Agent-First, Zero Founder Cost Execution Blueprint](architecture/AGENT_FIRST_ZERO_FOUNDER_COST_BLUEPRINT_2026-10-11.md), tracked in issue #62 and the live execution frontier #34.
