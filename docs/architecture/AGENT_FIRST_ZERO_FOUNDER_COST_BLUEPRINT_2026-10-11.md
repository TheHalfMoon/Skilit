# Skilit: Agent-First, No Founder-Funded AI/Cloud — Execution Blueprint

Status: PROPOSED, implementation-ready planning amendment; **not** code activation and **not** a claim of release qualification.
Prepared: 2026-10-11.
Scope: TheHalfMoon/Skilit. Primary tracking issue: #62; canonical execution record: #34; Build Kit: #9.
Parent contracts: PRODUCT.md; ARCHITECTURE.md; SECURITY.md; CODE_PROVENANCE.md; DATA_PROVENANCE.md; docs/IMPLEMENTATION_PLAN.md; docs/architecture/PLAN_HARDENING_2026-10-08.md; docs/operations/PLAN_GAP_REGISTER_2026-10-08.md.
Priority: All existing P0 security/rights/launch gates stay binding. This is an ADDITIVE plan to resolve the founder's clarified business and technical objective.

## 0. Non-negotiable product decision

**Skilit must be the best trustworthy, low-friction design-research and design-evidence infrastructure for external AI agents, without Skilit providing/funding AI inference or founder-funded compute.**

Skilit does NOT own the agent brain. It owns verifiable design evidence, structured data, search, change detection, design-system tokens, registry assets, reproducible Build Kits, editing handoffs, and reliable agent-access protocols.

- Users and clients bring their own AI agent/model and pay their agent/model provider or run it on their own machines; Skilit neither hosts an LLM nor proxies customer model credentials by default.
- Required workflows run with **no AI key, no GPU, no paid cloud account, and no hosted model**. Offline mode means previously available/local evidence is usable without a network. Public URL capture legitimately needs target-site network access, but **not** paid AI/cloud services.
- Self-hosted/local installs run storage/CPU/Playwright at the user's expense. A public managed SaaS incurs real costs and **cannot** promise zero infrastructure cost; commercial hosting must be separately budgeted and explicitly approved.
- Native agents are primary clients; human UI is a first-class optional viewer of the same canonical objects. No feature may exist exclusively behind a UI that agents cannot access.
- No generic chatbot, autonomous research agent, model router for inference, cloud image generation, or duplicated Figma-class editor is in launch-critical scope.
- Never import donor complexity because permission exists. Each transplant must beat existing Skilit capabilities in a measured, rights-qualified way.

### Why this improves on an ordinary design catalogue
The differentiation is **agent task success**: one agent can discover a real example, retrieve the exact evidence/rights/tokens, build or update an interface with its OWN model, save a stable pack, and a different agent can recover the same references. Skilit supplies evidence and tools rather than unverifiable synthetic design advice.

## 1. Verified baseline and non-destructive execution rule

The live examination found:
- Skilit web: Next.js 15 / React 19 / pnpm workspace; PostgreSQL-backed domain, workspaces/collections, REST and MCP entrypoints.
- Existing apps/web/lib/mcp.ts tools include search_assets, get_asset, get_registry_item, save_reference, create_reference_pack, get_object. Broader planned tools are **not proven implemented** merely because they appear in the roadmap.
- Existing apps/web/lib/reference-packs.ts exports skilit/reference-pack/1 over collections, with skilit://collection/{id} and artifact links. **Preserve and extend**, do not fork into ArtCraft's board storage.
- Existing plan P11 mentions pgvector and local embeddings; these are **optional enhancements**, not mandatory readiness under this decision. PostgreSQL lexical search is the dependable baseline.
- G09b-05 PR #61 was confirmed merged, merge commit d4f4a1c7070fd9c0cdece2aeb0ef734b0e2aaa17 at the time of planning. Revalidate main and #34 before each grain, never force an old SHA.
- Issue #62 is the ArtCraft/Craft selective reuse track. This document adds exact business boundaries, sequence, tests, owner-cost model, and go/no-go criteria without changing PR #61 or previous canonically merged grains.

Current security and gap-register P0 items remain OPEN until their own required tests and evidence demonstrate closure. This document only closes **planning ambiguity**, not those engineering risks.

**Concrete R2 audit concern from live code reading:** Canonical artifact lookup in packages/db/src/graph.ts currently accepts an artifact ID without caller identity, while the MCP and REST get_object paths invoke it to read object metadata. Do not infer tenant authorization from a preceding session check: before any remote-agent expansion, write denied cross-workspace/private-artifact regression fixtures and enforce server-side object visibility for every retrieval path. Treat exposure of a title or rights metadata as a privacy breach, even when bytes are not served. This is a blocking remediation grain, not a reason to replicate a second database or bypass the central domain services.

## 2. Deployment / cost contract

| Mode | Who hosts storage, jobs, inference | What Skilit guarantees | Scope |
| --- | --- | --- | --- |
| Local single-user | Customer workstation: local PostgreSQL, filesystem, browser capture; own external agent | No account on a paid cloud or model service required; local evidence and agents work offline after installation | First supported zero-founder-spend mode |
| Customer/team self-hosted | Customer server/LAN/VPS, customer pays compute/transfer/backup | Containerized web, worker, PostgreSQL and file storage; no dependency on founder SaaS | Paid Team / Business route |
| Remote MCP on customer domain | Customer hosts HTTPS endpoint, auth and infrastructure | Published secure protocol + same Skilit tools; no founder proxy | Self-hosted extension |
| Founder-hosted managed SaaS | Founder bears CPU, browser, bandwidth, DB, backups, operational risk | **NOT OFFERED** until measured caps/pricing/margin, abuse protection and budget approval | Explicit future optional business |

No mandatory: third-party vector DB, paid search SaaS, model APIs, hosted embeddings, proprietary CDN, cloud GPU, ArtCraft credits/services, monthly metered donor endpoint, analytics SaaS, email delivery SaaS, or recurring licensing server to access local core features.

Allowed only with consent/config: network-dependent URL capture, updates, optional telemetry (off by default in private/local deployments), customer-supplied storage, and customer-paid AI (processed by the **external agent**, not Skilit).

Operations details:
- Use filesystem content-addressed assets and PostgreSQL locally; the existing S3-compatible adapter stays optional for the customer. Define migrations, backups, retention, restore and safe upgrades in self-hosted distribution.
- Provide documented Docker Compose/dev bootstrap if qualified, pinned images with SBOM, a secrets/env preflight, health/readiness, default loopback binding and no surprise external port exposure. Do not promise an easy packaged installer until clean-machine proof.
- Long jobs are bounded by CPU, RAM, bytes, pages, wall time, concurrency and per-account/workspace quotas. Untrusted imports never get network access except an explicit egress policy.
- Subscription revenue: software features, collaboration, support, team licenses and self-hosted enterprise; user-paid model compute is outside Skilit. Offline entitlement can be a signed, time-bounded file with an explicit documented grace period; do not silently depend on a cloud license beacon. Commercial/legal accounting still incurs payment processor/support/tax costs, even if the core server spend is zero.
- Cost dashboard/report counts: browser-seconds, object bytes and lifetime, network egress, DB/storage growth, job CPU-seconds, backups, memory peak and requests per workspace. Show **resource units**, not invented dollar savings. For any later hosted offer, estimate actual unit prices and enforce hard operator budgets and circuit breakers.

## 3. Canonical ownership and packages

The existing PostgreSQL design graph and Skilit storage/provenance/contracts remain **the only canonical truth**. ArtCraft boards, VectorCraft files and optional editors are projections or foreign interchange formats, not alternative identity/workspace systems.

Proposed additional packages or feature slices (actual directories only after acceptance):
- packages/agent-contracts: schema-versioned object/tool envelopes, stable URI parser/formatter, compact context format, pagination and error taxonomy. Fold into an existing qualified package instead if it already exists.
- packages/search: rights-filtered PostgreSQL FTS, trigram/facet ranking, lightweight deterministic similarity functions and search evaluation fixtures; embeddings as optional plugin.
- packages/reference-board-ui: selective React/Konva board UI, client-only dynamic import with portable SkilitAdapter; persistence via Skilit collections and optimistic revision checks.
- packages/media-reference: bounded browser-video frame extraction, sanitization, source timestamps and provenance mapping.
- packages/editor-adapters: versioned headless VectorCraft/PhotoCraft/OpenPencil adapters, disabled unless executable is installed, pinned and sandboxed.
- packages/testkit: MCP/REST golden fixtures, replayable captured HTML/video/images, rights and prompt-injection negative cases and agent journey harness.

Skilit public contracts:
1. Stable typed URIs for each public object. Internal DB IDs or vendor tokens never leak as authority.
2. Exactly one canonical retrieval/search/rights service used by UI, MCP, REST and future SDK/CLI. No per-interface permission or ranking fork.
3. Domain identity is immutable; deleted/retracted/unavailable objects return explicit tombstone/rights state, not silently replaced screenshots.
4. Every exported claim says evidence mode: observed, deterministic computation, heuristic inference, generated-by-external-agent, or unknown. Absence is not proof of an interaction.
5. Per-item reference provenance: source identity, source commit/record where relevant, rights/serve policy, capture time, content hash, optional URL and derived-from links.
6. No secret, auth token, private URL, captured page script, or unsupported model-generated assertion becomes instructions in the agent context pack.

## 4. Agent protocol, DX and correctness

### Standard capabilities (target interface, not claim of implementation)

Provide a small INTENT-based MCP tool family with the same REST/SDK/CLI semantics:
- search_design(query, kinds, filters, cursor, limit, response_detail)
- get_object(uri, revision?, fields?, include_provenance?)
- find_similar(uri_or_local_image, mode, filters, cursor) — deterministic image fingerprint/metadata mode first; mark capability unavailable when semantic model disabled
- compare_design(left_uri, right_uri, dimensions) — evidence-linked observed diffs, no invented causality
- analyze_url(url, bounded_scope, idempotency_key) / get_analysis / cancel_analysis
- resolve_asset(uri, permitted_variant) / search_registry
- save_reference(collection_uri, artifact_uri, idempotency_key)
- create_reference_pack(workspace_uri, artifact_uris, visibility, idempotency_key) / get_reference_pack
- list_flows / get_flow_steps where qualified corpus exists
- get_changes(product_uri, version_range) when P13 is qualified
- optional export_design(pack_uri, provider, operation) for P14, disabled if no qualified local provider exists.

The first implementation only exposes tools whose underlying services actually work. Prefer adding 1-2 qualified user-intent tools to adding every planned tool with placeholders.

Uniform result envelope: schema_version, request_id, object URI(s), typed result, pagination cursor if applicable, complete/partial status, source/rights summaries, freshness/capture version, warnings/capability-unavailable reason, safe retry hints and optional job handle. Default context is bounded and concise, with explicit expanded-detail retrieval; prevent resource flooding.

Define stable error classes and HTTP/MCP mapping: INVALID_INPUT, UNAUTHENTICATED, FORBIDDEN_OR_NOT_FOUND, NOT_AVAILABLE, RIGHTS_RESTRICTED, STALE_REVISION, RATE_LIMITED, QUOTA_EXCEEDED, PROVIDER_DISABLED, JOB_PENDING, JOB_FAILED, TIMEOUT, INTERNAL_OPAQUE. No raw stack traces, credentials, path disclosure or different existence oracles for inaccessible workspaces.

### Transport/auth
- Local stdio: binds to an explicitly chosen Skilit local profile/workspace; private transport over OS/process, no unrestricted shell or network side effect. The OAuth-for-HTTP profile does not apply automatically to stdio.
- Remote Streamable HTTP: follow the official MCP 2026-07-28 protocol, with tested version negotiation/backward compatibility and official SDK conformance; OAuth Protected Resource Metadata, valid issuer, audience-bound tokens, PKCE for public clients, least-privilege scopes, expiration/revocation, no token passthrough. Auth MUST be enforced by the server, not by prompting the agent.
- Support Tasks extension only when a client advertises it; REST job status/cancel/retry works for other clients. MCP Apps are progressive enhancement, not required to access core evidence; embed only via official UI resources with sandbox.
- Separate minimum scopes for evidence:read, collection:write, capture:run, export:run and workspace:admin. Reads are default; write/destructive/capture/export actions require a separate authority grant. Audit principal, workspace, resource, tool version, job ID and redacted outcome.
- Support at least 3 real independent client implementations (one CLI/stdio; two distinct authenticated remote MCP clients) with capability negotiation and a fallback REST journey. Do not assume that different wrappers for one SDK count as independent hosts.
- Publish machine-usable docs, tool examples, JSON schemas, TypeScript SDK and Python SDK/CLI only as their own tested bounded grains. Client onboarding should take one environment-specific configuration and a working sample call.

### Prompt-injection and tool trust
All page DOM, OCR text, metadata, image alt text, donor content, user-entered labels and tool results are **data**, never Skilit policy or instructions. Render context packs with explicit untrusted-data boundaries. Hostile captured content must not direct a tool call, leak tokens, change rights or change workspace. Schema validation, allowlists and operation authorization are independent of any LLM interpreting the text. Pin tool definitions; defend tool shadowing, argument injection, path traversal, mixed-trust context, cache leaks and tool-description poisoning.

## 5. Deterministic zero-model research and search

Required research loop: qualified rights-cleared corpus -> canonical graph -> PostgreSQL FTS/facets -> inspect -> select -> save -> reference pack -> another agent/client retrieves identical evidence. This is the central product, not an embellishment.

Search default ranking is auditable and reproducible: lexical relevance, deterministic aliases/tags, kind, rights eligibility, provenance completeness, documented quality, recency and stable ID tie-break. Permissions/rights filter **before** rank, facets, suggestions, similarity and caching. Index maintenance has transactional/outbox reconciliation and rebuild tests.

No-AI visual aids:
- Perceptual hash, aspect ratio, color histogram, layout geometry, detected DOM semantics, design-token distances and exact image/file hashes.
- Such signals support duplicate and approximate-style matching; NEVER label them equivalent to trained semantic image/text embeddings.
- Image->semantic similarity is an OPTIONAL locally installed customer-run model plugin (if ever warranted), pinned weights/tokenizer/license, CPU/RAM/runtime budget, opt-in install and deterministic fallback when disabled. No automatic model download, no mandatory pgvector population or GPU.
- Existing PostgreSQL / pgvector extension may remain installed if already qualified but cannot be a required extension for the plain lexical path. Reconcile P11 wording to this superseding no-model fallback decision in a later dedicated amendment/contract grain.
- A frozen human-rated retrieval dataset with query types, relevance labels, rights constraints, recall and latency baselines is required before claiming "best for agents."

Lens + Build Kit must remain reproducible from URL/DOM/screenshots, extraction and source-linked tokens; generated React starter must build cleanly and explicitly mark unobserved interactions as stubs. No model inference is a prerequisite; optional user-run agents may later improve descriptions outside Skilit.

## 6. ArtCraft/Craft donor incorporation decisions

Source/use scope is based on verified code presence, not marketing. Existing ArtCraft repo has MIT OR Apache-2.0 with NOTICE and identified third-party exceptions. ArtCraft-services includes a restrictive Fair Source/WIP LICENSE.md; founder reports separate reuse permission for relevant code, but record the precise scope; third-party assets and other people's trademarks are NOT assumed licensed. SHA-pin every source before any import. Eight sampled matching library blobs between artcraft and artcraft-services were observed, but **do not infer all paths are identical**.

| Donor | Decision | Proposed implementation | Exclusions |
| --- | --- | --- | --- |
| storytold/artcraft frontend/libs/components/moodboard | SELECTIVE TRANSPLANT at P12 | Shared board model, grid/canvas/presentation, drag/snap/history, serialization behind SkilitAdapter. Preserve copyright/NOTICE. | ArtCraft cloud sync, hosted media, brand/design tokens, private media datasets |
| storytold/artcraft-services frame-extractor/lib/extract-frames.ts | NARROW TRANSPLANT at P10 | Client-side bounded seek/capture with cancel, CORS/decode/timeouts, restore playhead; attach source video hash/timestamps | ArtCraft API, paywalled media, user-gallery subscription |
| storytold/artcraft frontend/libs/components/pagedraw | CONDITIONAL TRANSPLANT at P14 | Only local draw/mask/layer primitives that pass dependency and browser SSR audit | ArtCraft hosted generation calls and model-list/provider tokens |
| storytold/vectorcraft CLI/MCP | OPTIONAL HEADLESS ADAPTER at P14 | Explicitly installed per host with exact binary pin and root-constrained file access; SVG and editable vector output | Whole engine vendored into web, unauthenticated TCP control and unrestricted scripts |
| storytold/photocraft CLI/automation | OPTIONAL HEADLESS ADAPTER at P14 | Explicit local raster/mask editing and artifact export with sandbox | GPU/cloud requirement, arbitrary shell access |
| storytold/designcraft / effectcraft | POST-LAUNCH EVALUATE | Optional document-layout and animation/Lottie handoff behind tested provider interface | Launch-blocking bulky runtimes |
| storytold/filmcraft / lightcraft | DEFER | Only benchmark-justified codec/image metadata utility; check existing pipeline first | Default video/editor or raw-photo stack |
| storytold/artcraft pagescene/video-editor | REJECT FROM CORE | Reference only until a real independent need is demonstrated | Large 3D/film studio, hosted model marketplace, credit system |
| storytold/craft-libs | REFERENCE ONLY | Shared egui UI conventions potentially useful to independently packaged Rust tools | Import into Next.js React UI; no relevant runtime win |

Before transplant: list file-level manifest, complete transitive imports (including CSS, fonts, bundled WASM), exact source commit and blob hash, license/attribution, data/asset/model/trademark exclusions, security and dependency vulnerabilities, cold-load/asset-size benchmark, target tests and rollback. Use existing UPSTREAMS.lock.yml and CODE_PROVENANCE.md; **no code is authorized to activate solely from this plan**.

The adapter contracts all specify capability, version, source pin, input/output schema, deterministic config, resource limits, cancel/timeout, error class, provenance, egress and cost, health, uninstall/fallback and no-model behavior.

## 7. Core data additions and migrations (proposed; must check existing schema)

No second canonical collections store. Proposed minimally normalized objects:
- BoardLayout: collection_id + layout_schema_version, revision (optimistic CAS), content_hash, created_by, updated_at; stored JSON constrained by byte/node/depth caps. Cards reference only existing canonical artifact URIs; layout keeps order, positions, groups, viewport and presentation sections.
- Board events/audit: actor/workspace/idempotency key, revision conflict response; no cross-tenant localStorage sync.
- VideoReference: source Asset URI/hash and rights, observed timestamps, extraction settings/tool version, source-run ID, derived frame Artifact URI/hash; explicit no-interaction-observed flag, optional verified FlowStep relation.
- EditorJob: actor/workspace/provider/version, approved args/input URI(s), idempotency, status, budget, produced files/hash/rights/derived-from, cancellation and scrubbed diagnostics. No arbitrary user process commands or remote script execution.
- Data Takedown: source rights state, tombstone, dependent derivatives, cache/search index purges and audited completion.

Check exact DB schema/migrations first. Enforce foreign keys, tenant rules and one authoritative revision model. CAS conflict is a real conflict; never silently overwrite a newer board.

## 8. Implementation grains / precise order and exit evidence

Every grain: exact current-main preflight, bounded contracts and fixtures BEFORE code changes, branch with exact base, independent diff, tests, Graft/PStack/Alibaba OCR checks as truly available, exact-head CI, ordinary merge, post-merge checks and closeout. If OCR ran in delegate/no-model mode, record that fact; do NOT pretend a full LLM review occurred.

| Grain | Dependency | Implementation | Proof / exit |
| --- | --- | --- | --- |
| AF-00 Plan and priorities | #62 + #34 | This document, source decisions, no-cloud contract, no dual implementations | Plan reviewer reconciles P00-P15 and preexisting P0 gap register; no runtime claim |
| AF-SEC-00 Actor-scoped object reads | AF-00, R2 | Centralize artifact access checks for REST/MCP and all render/asset metadata paths; avoid ID-based visibility bypass | User A cannot retrieve private/workspace-B metadata by forged URI/ID via any interface; no leak in search, caches, object URLs |
| AF-01 Immutable donor audit | AF-00 | Source/permission matrix; per-file include/exclude, hashes/NOTICE, license and CVE scan, dependencies, baseline sizes | Source-only exact pin; code and third-party assets separated; frozen donor fixture |
| AF-02 Zero-model/egress conformance | AF-00; no conflicts with ongoing P09b | CI toggle denies model/cloud credentials and unapproved egress; explicit config/feature states | Clean environment with all model/provider secrets missing starts local web/worker/search/MCP and existing Lens fixture; fail closed |
| AF-03 Agent contract audit + parity | AF-SEC-00, AF-02 and current P08/P09b checks | Versioned tool envelopes; OAuth remote, stdio scope boundary, error map, search/get/pack API parity | 3 actual clients; write scopes; cursor/version tests; unauthorized/revoked denied |
| AF-04 Deterministic research search | R3, AF-03 | SearchDocument projection FTS/facets, evidence ranking, frozen relevance dataset, zero-vector path | API/MCP/UI same ranked rights-filtered fixtures, no vectors/GPU; tenant denial |
| AF-05 P09b Build Kit closeout | In-flight canonical G09b program | Continue current G09b successors with no scope hijack | Real 3-page rightscleared ZIP, clean install/typecheck/build, responsive/keyboard, cancellation and rights-denial |
| AF-06 P10 Video-to-Evidence | AF-01 + AF-04 + P10 corpus | Extract bounded frame engine; artifact and observed FlowStep mapping, video player evidence UX | Synthetic video->frames->artifact->MCP->flow; cancel/CORS/corrupt/size/rights negatives |
| AF-07 P12 Board domain adapter | AF-01 + R3, AF-06 optional | Collections-backed layout schema/revisions and portable serialization; no UI first | Multi-workspace CRUD/CAS, offline edit restore, tombstone, logout/identity swap; zero hosted media |
| AF-08 P12 Board human UI | AF-07 | Selectively transplant Konva Grid/Canvas/Present, accessible toolbar and client-only load | Large-board perf, mobile and keyboard tests, a11y/reduced-motion/RTL; UI->MCP pack parity |
| AF-09 Evidence compaction + handoff | AF-03, AF-08 | Versioned bounded context packs; citation/rights/freshness and missing-data semantics | Agent A captures/selects, Agent B retrieves by URI, hashes and rights match; deliberate prompt injection ignored |
| AF-10 Local vector adapter P14 | R5 and core P08-P12 quality gates, AF-01 | VectorCraft installed opt-in CLI/MCP adapter, root confinement, token-to-SVG export | reference pack+DTCG->editable SVG->reopen->Asset; no cloud, cancel, CPU/memory/path limits |
| AF-11 Raster/Pagedraw adapter P14 | AF-10 only if justified | PhotoCraft then PageDraw selected masks/layers | Input/output exact byte hashes, open/export, sandbox, fail when donor API/cloud requested |
| AF-12 Commercial/local release | R6/R7, AF-02..AF-09 | Clean self-hosted distribution, billing entitlements, quotas, backups, licenses, recovery, docs | clean-machine no-model/no-paid-cloud proof, signed SBOM release, restore, privacy/takedown, user and agent acceptance |

Execution **may follow established P09b**: AF-01/AF-02 may be parallel planning and security work, but never merge overlapping public contracts; AF-06 only when P10 is opened, AF-07/08 when P12 is opened, AF-10/11 after P14 entry gate. The issue #34 frontier is authoritative after live revalidation. No giant combined PR.

First executable donor grain is **AF-01**; first new product feature is AF-06, not a 3D scene editor. AF-03/04 are higher priority than artistic tooling for the founder's "best for agents" objective.

## 9. Threat, data rights, egress and abuse matrix

Mandatory negative-proof fixtures:
1. Captured URL points to RFC1918/localhost/metadata via DNS, redirect, rebinding, subresource, service worker, browser websocket and egress bypass -> **blocked at network boundary**; worker has no cookies/SSH keys/cloud credentials.
2. Poisoned HTML/SVG/metadata/alt text claims to be developer/system policy, asks the agent to call a tool or leak token -> **retained as inert data and never promoted to authority**.
3. User A requests user B's private object/collection/asset, a board image URL, MCP resource, pack export, search facet count or cached thumbnail -> **denied with no existence side channel**.
4. No license or unknown trademark/screenshot/third-party bundled file -> metadata/link-only or restricted; ZIP/board export cannot leak bytes; derivative and thumbnail purged on takedown.
5. Malformed zip/SVG/PDF/video: decompression bomb, MIME lie, external resource, paths with traversal/symlink, oversized dimensions or pixel bombs -> bounded reject; no same-origin script execution.
6. Editor executable injection, unsafe arguments, shell metacharacters, plugin loading, symlink path escape or arbitrary TCP listener -> reject with explicit per-job read/write roots and no ambient network authority.
7. Agent endpoint: invalid OAuth issuer/audience/scope, client impersonation, long-lived credentials, tool poisoning and request floods -> reject with redacted audit.
8. Outage or cancellation during render/export/import; repeated idempotency key and worker crash -> bounded retries, no duplicate canonical assets, no stuck billed job.
9. Telemetry, model SDK, DNS update check or donor endpoint attempts unapproved egress in no-cloud mode -> fail CI or runtime admission guard.
10. Workspace/account swap while board syncing or dirty -> no cross-account pushes or silent state overwrite.

No public Internet remote exposure of localhost-administration routes by default. Provenance includes taint status and data classification; no training/upload of private data to external models. Use official MCP specification and OWASP MCP top-ten as threat reference, not as proof that tests pass.

## 10. Measurement, success and release gates

Founder's goal "best for agents" is a **benchmark target**, not a claim. Establish a reproducible 25-task minimum golden suite with an increasing diverse corpus: discovery/asset lookup, URL analysis, token capture, rights filter, comparative references, collection collaboration, cross-agent pack handoff, ZIP export, denied reads/writes, cancellation/retry and wrong-source resistance.

Proposed thresholds (planning targets, NOT measured):
- >= 95% correct canonical object/URI resolution on the synthetic + rights-cleared test set.
- 100% zero cross-workspace data exposures and 100% fail-closed restricted-byte serving in security fixtures.
- 100% of required no-model workflows executable without AI keys, GPU and paid-cloud credentials.
- >= 90% task success on independent agent-client acceptance harness for supported capabilities; all failures explained by typed errors, and zero fabricated provenance.
- p95 warm local metadata/FTS search < 500 ms on a specified fixed dataset/hardware and MCP read tool < 1s excluding long jobs; benchmark before claiming.
- Video/import and board large-set budgets defined from an actual constrained-device baseline; establish the threshold in AF-01, gate regressions rather than inventing FPS numbers.
- Repeated import, cancellation and crash recovery produce identical logical IDs/rights and no duplicate artifacts; determinism fixture passes.
- Clean self-hosted restore, schema migration upgrade/revert strategy, offline read and update procedure, backup and delete/derivative-purge proof.
- 3 independent MCP clients plus REST fallback pass main journeys; unsupported MCP Apps/Tasks extensions degrade without breaking results.

Agent quality metrics measured without customer-content analytics SaaS: time from connection to first useful citation, percent of tool calls resolved with sufficient evidence, number of tools/context tokens per completed task, search precision@k/nDCG on judged corpus, pack reuse in another agent, rejected-rights leakage, and time to reproducible Build Kit. Capture only opt-in or local aggregate metrics; sensitive prompts/screenshots stay private.

Readiness dimensions: R0 provenance, R1 runnable shell, R2 tenant/domain/storage, R3 S0 end-to-end, R4 guarded Lens, R5 qualified corpus/search and agent interoperability, R6 local/paid beta security+operations, R7 release correctness. No percent progress substitutes for actual gate evidence.

## 11. Launch cut, reversible decisions and stop conditions

**Commercial self-hosted Agent Core** ships after P15/R7 only when real no-model agent journeys, licensed evidence, API/MCP security and local deployment gates pass. P09b Build Kit is launch-critical per adopted plan. Advanced Create, VectorCraft, PhotoCraft, DesignCraft, EffectCraft, FilmCraft, LightCraft, Time Machine scheduling and mandatory semantic embeddings are NOT required for initial zero-founder-spend edition.

Stop any grain immediately (while continuing independent qualified work) if: permission for that exact imported file is insufficient; 3rd-party media rights are unknown; existing Skilit capability already passes acceptance without import; paid/cloud service is unavoidable; bundle/resource budget overflows; authorization/audience/SSRF/egress fails; tests are not reproducible; exact-head review/CI is missing; or an owner-authored branch has changed concurrently.

Rollback by module: feature flag off, block new jobs, expire/revoke its old resource URIs with clear state, restore previous search index/revision, preserve lineage and audit, and do not delete user originals or legitimate packs. Imported donor binaries must be separately removable.

## 12. Ready-to-implement checklist for first engineering PR (AF-01)

- [ ] Revalidate HEAD on main, #34 frontier, #9, #62 and any active PRs. Create exact-base non-overlapping grain.
- [ ] Prioritize AF-SEC-00 before exposing additional MCP/REST capabilities; check actor-bound read access tests and file a narrow security follow-up with least disclosure needed.
- [ ] Freeze donors' full 40-char commits and per-file SHA; compare ArtCraft main/services overlapping blobs before selecting source.
- [ ] Generate dependency closure inventories for Moodboard and FrameExtractor; enumerate internal packages, CSS/fonts/WASM/assets/API calls. Record alternative existing Skilit implementation.
- [ ] Prepare include/exclude manifests and permissions for code vs data/assets/models/services/marks; preserve NOTICE and copyright.
- [ ] Define performance bundle cap and local memory budget using a measured baseline on project hardware.
- [ ] Add negative contract fixtures for cloud/model egress, tenant privacy, media rights and an idempotent import.
- [ ] Update provenance locks as PLANNED only until import qualification; no model API, service credentials or bundled game/meme resources.
- [ ] Run real build/security/contract checks and the PStack review panel, Alibaba OCR (classify genuine scan vs delegation), and Graft, then exact-head CI/normal merge/post-merge closeout.
- [ ] Post next-grain execution readiness to #62 and #34 with exact SHAs and remaining open blockers.

Planning completion definition: a developer can choose a named grain, start from verified main, see dependencies + files + risk + tests, run gates and confidently say PASS / BLOCKED / DEFERRED. **No amount of planning alone makes the project or an integration complete.**
