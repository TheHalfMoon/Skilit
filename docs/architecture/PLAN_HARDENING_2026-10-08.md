# Skilit Architecture Review and Plan Hardening (2026-10-08)

Status: PROPOSED, effective only after governed merge into canonical `main`.
Authority: additive clarification of `docs/IMPLEMENTATION_PLAN.md`. No previous canonical grains are reopened.
Change class: documentation-only. No donor source, media, models, or dependencies are activated.

## Verdict and key correction

Retain Skilit as an **agent-first design intelligence layer**, not a second canvas editor or an inexpensive screenshot clone. The existing normalized Artifact graph, modular monolith, PostgreSQL authority, provenance/rights separation, local-default providers, and exact-head governance are sound.

**Critical correction:** the G01-01 Monet selection contains only 90 qualified source paths, excluding most UI, components, data, and screenshots. It cannot itself prove a runnable Monet-based Next.js application. G01-02a established a 45/45 candidate/quarantine preflight; PR #7 contains a single isolated screenshot-queue module, not a full product. P01 must therefore use **capability-first selective reuse and a clean Skilit app shell** instead of assuming an imported donor application will work. Do not fabricate full-build evidence or import quarantined code to satisfy a milestone.

## 1. Product ownership and first vertical slice

Skilit owns: research evidence and source identity, asset discovery and rights, URL/image Lens, component registry, multimodal search, saved reference packs, API/MCP, and its own product access and billing.

**Do not duplicate** Lilac's design/editor canvas, Ineractive's app generation, Morize's durable agent memory, or Kernux/Deskal browser/computer runtime. Integrate only qualified capabilities through versioned adapters. TheHalfMoon readmes/roadmaps are **leads**, not proof of actual reusable runtime implementations.

First demonstrable vertical slice S0:
1. Ingest a small rights-qualified icon/component fixture (synthetic corpus and specific permitted collections).
2. Preserve exact Source/Artifact/Asset lineage and public/private serving policy.
3. Search deterministically via PostgreSQL FTS and return ranked objects with license filters.
4. Inspect from the human UI; save to a workspace collection; export a reference pack.
5. Retrieve that pack and every cited object through the same REST and MCP canonical services from another client.

Then S1 adds **safe URL Lens**: isolated capture, evidence-rich report, tokens, screenshot/DOM refs, async job handle, and agent export. Do not require embeddings, complex visual flows, paid models, MCP Apps, or full commercial billing to prove S0. This is an incremental integration gate, **not** a reduction of the original v1 paid-launch scope.

## 2. Execution dependency rebaseline (without restarting)

| Gate | Dependency | Required proof |
| --- | --- | --- |
| R0 Rights + donor decisions | Canonical P00 and G01-01/01a/02a | Immutable source pins, source-vs-asset authorization, quarantine decision, imported-path ledger |
| R1 Runnable app shell | R0 | Clean Next.js Skilit workspace install, lint, strict typecheck, build, health route; **no** dependence on excluded donor content |
| R2 Canonical domain + tenant rights | R1 | PostgreSQL migrations/constraints, storage, workspace auth, cross-tenant denial including asset URLs and vectors |
| R3 Integrated S0 | R2 | Authenticated ingest -> search -> UI -> collections -> REST/MCP -> reference pack roundtrip; zero external model required |
| R4 Safe URL Lens S1 | R3 | Public URL -> isolated fetch/capture -> token extraction -> provenance -> job polling/partial status; SSRF/egress tests pass |
| R5 Broader catalogue | R4 | Screen/flow and qualified assets, relevance benchmarks, visual search if CPU/rights justify, shadcn registry installer proof |
| R6 Commercial beta | R5 | Billing/quota/abuse tests, tenant isolation, terms/takedown, accessibility, measured unit economics, deployment recoverability |
| R7 Commercial v1 | R6 | All original minimum launch journeys, 3 distinct agent clients, robust E2E/load/incident exercises, signed release |

Existing P00–P15 deliverables remain in force. Where P01/G01-03 assumed a runnable full Monet app, reinterpret the next executable foundation as a clean Skilit-owned shell integrating only separately qualified donor capabilities. Neither rename nor silently close already merged grains.

## 3. Canonical services, indexing, and failure model

- PostgreSQL remains authoritative for users/workspaces, source/rights, artifacts/assets, collections, versions, jobs and audit. Object storage is content-addressed; search vectors/FTS projections and caches are **rebuildable**, not canonical.
- Define data ownership, transaction boundaries, revision IDs and migrations before parallel feature development. Use a transactional outbox for `publish -> index`; acknowledge partial optional enrichment without publishing invalid canonical data.
- Postgres queue (pg-boss candidate) must have stable idempotency keys, leases, retry/jitter, rate/concurrency caps, cancellation, poison queues, replay, audit and recovery. The imported ephemeral `ScreenshotQueue` is **not** the durable worker queue.
- Apply tenant and rights filters before ranking, not after. Enforce at API, MCP, object URLs, embeddings, suggestion counts, sharing, caching, search facets, exports, and reference-pack recovery.
- Public ID and `skilit://` URI resolution must be stable regardless of donor/provider IDs. Define 404/403 semantics, historical version access, provenance changes and authorized object deletion.

## 4. Browser/Lens and prompt-injection security

- HTTP(S) URLs only. Validate DNS answers and redirect targets, and **enforce network egress policy at the worker/socket/container level**, not URL parsing alone. Block loopback, private, link-local, CGNAT, metadata service, reserved ranges, IPv4-mapped IPv6, DNS rebinding and subresource/redirect escapes.
- Browser runs without host secrets, cookies, shared session, cloud credentials, developer home mount or host/LAN access. Bound page/process count, runtime, memory/CPU, redirects, bytes, DNS, robots/site policies, concurrency and per-workspace quotas.
- Captured HTML/SVG are inert or sandboxed under an unprivileged origin; never trust captured metadata, OCR text or web content as agent instructions. Tests cover prompt injection, tool-call bait, malicious SVG, cache poisoning and unsafe export.
- Rights to view a public URL are not rights to publish screenshots. Track capture/retain/derived-metadata/display/download permissions separately. Have requests to remove content, retention limits and derivative/cache purge.

## 5. MCP 2026 protocol and agent experience

Use the official `2026-07-28` MCP specification for new-client capability targets, with version negotiation and fallback to older supported clients. Use official SDKs (pinned when activated), Streamable HTTP and declared extensions. Long-running Lens/analysis uses the official **Tasks extension** where available or an explicit REST status handle where not; do not rely on deprecated experimental Tasks core.

- Protected resource metadata discovery, audience-bound OAuth token verification, PKCE, validated `iss`, client metadata documents (CIMD) preferred; reject token passthrough, replay and revoked sessions.
- MCP Apps must follow `modelcontextprotocol/ext-apps` `ui://` resources with sandboxed interactive views. Host support varies; UI is progressive enhancement, not data access authority.
- Each tool returns typed structured data, stable IDs/URIs, provenance refs, pagination, quotas/cost state, completeness, error taxonomy, and cancellation/timeout contracts. Avoid huge opaque tool output.
- Validate REST/MCP parity and **at least three actual clients** with anonymous/authenticated, revoked/expired, multi-tenant, Tasks-supported/unsupported and inaccessible-resource cases.

## 6. Search quality and local model proof

Commit a rights-cleared frozen relevance test set with intents, positive/negative relevance judgments and filtered licenses. Track nDCG@10, MRR, Recall@K, wrong-license exposure count, dedupe/version confusion, broken assets and latency by corpus size. Establish baseline thresholds *after* measuring the lexical implementation; do not invent generic pass values.

PostgreSQL FTS must work without models. pgvector plus local vision/text models are optional measured adapters. For each model: immutable weights/tokenizer pin, permission/license, CPU/RAM budget, quality delta vs lexical, wall time, cache/rebuild path, degradation fallback. Never require GPU or paid embeddings for the launch-critical baseline.

## 7. Corpus, rights and takedown operations

Differentiate import authorization for **code, data, screenshots, fonts, icons, logos, models, hosted services and trademarks**; preserve exact immutable source and item-level rights. Permission to copy a source repository is not an automatic grant to resell third-party screenshots/images in its pages or to redistribute another icon collection.

Metadata-only, link-only, serve, private-workspace-only and restricted are independently enforceable; a derivative inherits its most restrictive ancestor. Define reporting/takedown, workspace erase/export, purge of cached derivatives/embeddings/CDN copies, audit retention and appeal workflow with tested completion state.

## 8. Accessibility, product fit and commercialization

- Launch UI targets keyboard-only, screen readers, responsive layout, WCAG 2.2 AA for critical journeys, Arabic RTL and English LTR readiness, reduced-motion modes, theme contrast and high-density gallery behavior.
- Measure human and agent activation: search-to-useful-reference, asset/license correctness, Lens success, second-client reference-pack reuse, task completion, abandonment, onboarding time and paid conversion. Use real human and multi-agent usability sessions, not only snapshot tests.
- "Founder-zero-cloud-cost" applies to development/self-hosted paths, **not** a claim that public hosting, screenshot rendering, storage, bandwidth and support have zero costs. Measure browser-minutes, transfer/storage, search/embedding ops, cost per workspace and gross-margin budgets. The half-Mobbin pricing target requires actual launch-date price research and unit-economics validation.
- Rate-limit browser work across free/Pro/API/MCP identities; avoid unlimited free capture. Meter retries and provider failure, not just successful requests.
- Billing must test replay-safe signed webhooks, stale events, grace periods, downgrades, suspended users, seat counts, refunds, entitlements and no client-side plan trust.

## 9. Production readiness and release correctness

- Reproducible build/lockfiles, verified dependency licenses and vulnerability/SBOM checks, secret scans, migration rollback and restore drills, backup restoration RPO/RTO, protected branches, signed release artifacts, incident response, alerting and runbooks.
- `bootstrap` passing is **not** proof that the web app compiled. Distinguish unit, typecheck, integration, browser E2E, safety tests, perf/load and staging/deploy smoke with exact commit evidence.
- Each external adapter has an input/output contract, timeout, cancellation, provenance, egress/cost classification, health and degraded mode. Avoid vendor duplication unless benchmark shows unique benefit.
- Feature cuts and kill switches allow safe rollback of URL capture, public serving, external models, and billing writes without losing audit data.

## 10. Governance and stop rules

Every grain includes exact canonical base, scoped files/rights, dependency closure, local tests, Graft, the PStack review panel, Alibaba OCR review/applicability (no invented LLM review), exact-head CI, normal merge and post-merge `main` verification. If a donor has only README or planned architecture, classify it as **reference** until implementation evidence exists.

No phase or R gate may be declared done solely from a passing planning validator, an AI review, a donor README or an isolated copied file. Use actual working user journeys as exit criteria.

See:
- [Donor Reuse Decisions](../research/DONOR_REUSE_DECISIONS_2026-10-08.md)
- [Gap Register](../operations/PLAN_GAP_REGISTER_2026-10-08.md)
- [Canonical Implementation Plan](../IMPLEMENTATION_PLAN.md)
