# Skilit Plan Gap Register and Acceptance Tests (2026-10-08)

Status: PROPOSED implementation governance companion. No application features were implemented by this planning audit.
Canonical base examined: `8ff53f3cd9f392f00f5718eb2ac2981adcdbb1a0` (`main` after PR #6).
Concurrent frontier: PR #7 is an isolated donor screenshot queue under review; its successful build is not a full app qualification.

## Severity and decision semantics

- **P0**: do not publicly launch or activate relevant capability before closing.
- **P1**: must be planned and tested before production beta/commercialization of dependent capability.
- **P2**: important differentiated growth work; can defer when there is an explicit fallback and evidence.
- **Open** means not yet demonstrated in canonical implementation. A plan paragraph is not a pass.
- Each risk requires an immutable PR/grain, named owner, acceptance evidence and post-merge closeout. No arbitrary percent-complete claim.

| Gap | Priority | Owner / first gate | Acceptance proof; no-go if absent |
| --- | --- | --- | --- |
| G01 No runnable product baseline from 90 Monet files | P0 | App lead / R1 | Clean checkout, install, strict typecheck, lint, build, start and HTTP health smoke; do not infer from donor source count |
| G02 Unbounded donor copy/transitive code and notices | P0 | Source steward / R0-R1 | Imported-path manifest, exact blobs, per-capability dependency closure, notices, vulnerability and license inventory |
| G03 Product overlap with Lilac/Ineractive/Kernux | P1 | Architect / R1 | Ownership matrix and no circular runtime dependencies |
| G04 Cross-workspace access through assets/search/MCP | P0 | Security + domain / R2 | Deny user A from tenant B across search, preview, object URLs, reference packs, vectors and caches |
| G05 Missing durable job/outbox failure semantics | P0 | Worker lead / R2-R4 | Retry/replay/cancel/dead-letter crash tests; no duplicate publish or lost committed index event |
| G06 No source-rights-specific corpus readiness | P0 | Rights steward / R3-R5 | Only permitted screenshot/asset bytes served; metadata-only/link-only enforced; derivatives restricted |
| G07 URL worker network egress and SSRF defense | P0 | Security / R4 | Socket-level private/metadata/redirect/rebinding/subresource blocks in isolated runner with secrets unavailable |
| G08 Prompt injection from HTML/OCR/tool responses | P0 | Agent security / R4 | Malicious captured-page fixtures cannot instruct tools, exfiltrate credentials or override user auth |
| G09 MCP protocol drift / extension host differences | P0 | Agent API lead / R3-R5 | Official 2026-07-28 tests, OAuth PRM/audience/PKCE/issuer, Tasks optional/fallback, 3 host matrix |
| G10 Reference pack orphaning/stale IDs | P0 | Domain/agent / R3 | Deterministic pack re-import/URI lookup, tenant scoped, authorized tombstones and stale version semantics |
| G11 Non-measurable search "best" claims | P1 | Search lead / R3-R5 | Frozen human-judged benchmark and lexical baseline, test relevance improvements before vector model |
| G12 Unpinned/local visual model weights and cost | P1 | Search lead / R5 | CPU/RAM/time benchmark, exact model and tokenizer rights, egress-off fallback, no mandatory GPU |
| G13 No complete reproducible accessibility/RTL tests | P1 | UI lead / R3-R6 | Keyboard, screen reader, WCAG 2.2 AA, contrast, mobile viewport, reduced motion, Arabic RTL validation |
| G14 Unspecified billing failure/downgrade lifecycle | P0 | Billing lead / R6 | Signed webhook, replay/out-of-order, plan downgrade, seat quota, refund/grace tests |
| G15 Public free browser quota abuse and runaway cost | P0 | Operations / R4-R6 | Per-user/workspace/API job quota, CPU/bytes/rate limits, abuse alarms and kill-switch |
| G16 Missing actual cloud/storage unit economics | P1 | Founder/ops / R6 | Benchmarked browser-minutes, storage, egress, index/DB, active-workspace cost and achievable gross margin |
| G17 Missing deletion, legal request and derivative purge | P0 | Rights/ops / R6 | End-to-end takedown workflow incl. cache, OCR, embeddings, thumbnails, CDN and audit |
| G18 Insufficient release engineering | P0 | Release lead / R7 | Signed release, SBOM, dependency/secret scans, migration rehearsal, restore and incident exercise |
| G19 Over-broad paid launch before S0 proof | P1 | Product lead / R3 | Real human + agent end-to-end journey against rights-cleared fixture; abandon feature stubs |
| G20 No boundary between bootstrap CI and application CI | P0 | Build lead / R1 | CI includes complete product build/typecheck/e2e after app enters repo; bootstrap-only pass not launch proof |
| G21 Thin provider integration contract too informal | P1 | Integrations / R4-R5 | Pinned, typed, timeout/cancel, error map, provenance, health, rate/egress, contract fake and fallback |
| G22 Runtime authenticity, integrity and supply chain | P0 | Security/release / R6-R7 | Provenance/SBOM, exact dependency pins, reproducible lock, least-privileged CI and release verification |
| G23 Operational data lifecycle undefined | P1 | Ops/data / R6 | Retention/backup/purge, restore, RPO/RTO, export, encrypted secrets, audit integrity |
| G24 Licensing of each icon/font/logo item conflated | P0 | Assets/rights / R3-R5 | Per-item serving matrix, notices, explicit trademark state and tests rejecting disallowed file delivery |
| G25 Lack of negative provider tests under outage | P1 | Integrations/QA / R4 | Offline Lens path and deterministic partial-status report when optional providers fail |
| G26 Feature cutline for Create/Time Machine unclear | P2 | Product lead / R5 | Explicit post-core nonblocking toggles; no accidental dependency in v1 |
| G27 Missing qualitative user validation for agent UX | P1 | Product lead / R3-R6 | Tested same task via 3 clients; time-to-reference-pack and error taxonomy captured |
| G28 Weak malicious archive/image/metadata parsing boundary | P0 | Capture security / R4 | File upload caps, decompression bombs, MIME sniffing, path-safe parsers, sandbox and timeout |

## Runnable execution order after this planning grain

**Do not replace previously closed P00/G01 work.** The next implementation priorities are:

1. Close or reconcile the independent pending PR #7 using its own exact-HEAD review-stack/OCR/CI rules. A planning PR must not merge unrelated code or rewrite PR #7's head.
2. G01-02c: Source import dependency and quarantine resolution plan. Compute each candidate file's imported path dependencies, excluded references, licensing and runtime surface; select *only* the smallest useful module. Never blindly unquarantine.
3. G01-03a: Skilit-owned minimal Next.js application scaffold with health route, no donor branding or images, pinned pnpm/TypeScript/Node, clean install/build.
4. G01-03b: Integrate one qualified donor provider or component as a demonstrable app capability; imported/smoke status explicit. Do not claim full Monet parity.
5. G02 core: Workspace layout, worker shell, environment schema and local PostgreSQL. Preserve app behavior before and after structure change.
6. G03/G04 minimal domain and workspace-scoped rights, object-storage metadata, migrations; no public asset serving without policy.
7. S0 integrated fixture -> search -> inspect -> save -> evidence pack -> REST/MCP parity. Require authenticated and anonymous negative tests.
8. S1 isolated URL Lens after egress/sandbox gate; then phased broader corpus/visual search/MCP Apps/commerce.

Each line expands to small PR grains following `GOVERNANCE.md`. Do not commit both broad donor import and brand/UI redesign in one PR.

## Required PR evidence fields

| Field | Expected |
| --- | --- |
| Goal / R gate | One named user capability and explicit exit definition |
| Dependencies | Canonical merge SHAs and authoritative specs; current main checked |
| Donor | Source path, immutable commit, blob, permission/license, asset exclusions |
| Scope | Changed files, API/migration diffs, excluded areas and rollback |
| Threats | Auth/data flow, rights, egress, prompt injection, quotas where relevant |
| Verification | Reproducible local commands with outputs, fixtures and negative tests |
| Graph | Current Graft `build`, `check`, and exact-base `blast` |
| Review | Exact-diff PStack review-panel report (independent or explicitly degraded) + real Alibaba OCR or explicit delegate/unsupported status |
| CI | Actual successful CI on immutable PR head (not merely local/previous PR status) |
| Release | Normal merge commit and successful post-merge check on `main` |
| Product state | Explicit level: imported / compiled / integrated / reachable / launch-qualified |
| Closure | Canonical record that cites concrete proof, not estimated percent complete |

## Final audit statement

The existing plan is a good architectural foundation but **not gap-free** and not a currently complete product. This register closes gaps in **planning**, not in implementation. A future claim of launch readiness requires each P0 item to be demonstrably closed with tests and production evidence; P1 items may only be deferred where the affected beta/release scope explicitly excludes that capability.

Supporting decisions:
- [Plan Hardening](../architecture/PLAN_HARDENING_2026-10-08.md)
- [Donor Reuse Decisions](../research/DONOR_REUSE_DECISIONS_2026-10-08.md)
- [Canonical Plan](../IMPLEMENTATION_PLAN.md)
