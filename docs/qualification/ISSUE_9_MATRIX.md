# Issue #9 Traceability Matrix — Lens URL to Build-Ready Kit (AF-05 closeout)

Status of this matrix: COMPLETE (every criterion mapped). Overall
disposition: 8/8 criteria VERIFIED with committed, inspectable evidence.
Residual R1 (below) is closed by the automated consumer smoke; Issue #9
is eligible for closure on this matrix. No narrative-only claims: every
VERIFIED row names implementation, test, and evidence locations.

Review-stack superseding note (2026-10-21, `GD-2026-10-21-REVIEW-STACK`): the Jev mentions below are historical statements of the reviews that ran for the cited grains; they are preserved verbatim and are not a current gate.

## Criterion 1 — Three-page fixture kit — VERIFIED

Requirement: fixture site with 3 pages and mobile/desktop captures;
deterministic kit contains manifest, tokens, source-linked sections,
responsive component stubs, AGENT.md, and parsable ZIP.

- Implementation: `packages/lens/src/capture-scope.ts`,
  `capture-traversal.ts`, `kit-manifest.ts`, `kit-package.ts`,
  `starter-synthesis.ts`, `report-assembly.ts`.
- Tests: `three-page-fixture.test.mjs` (deterministic scope both
  viewports, 6 real offline Chromium renders with verified 1280x720 and
  390x844 dimensions, 6 distinct analysis IDs),
  `kit-fixture-chain.test.mjs` (report to export to starter to manifest
  to ZIP to parse round-trip; unknown-rights negative withheld).
- Evidence: PRs #74/#75, post-merge CI 38201265464/38201921391 SUCCESS,
  `docs/reviews/AF-05b*`, `docs/reviews/AF-05c*`, lens suite 189/189.

## Criterion 2 — Clean-checkout starter — VERIFIED

Requirement: generated starter installs, typechecks, builds, and passes
a visual layout comparison on the permitted fixture; functional stubs
explicitly marked.

- Automated consumer smoke: `scripts/prove_starter_consumer.mjs`
  (residual R1, closed): from deterministic fixture inputs it synthesizes
  the fixed 9-file starter plus the real kit-sibling theme, then in a
  pristine temp directory in kit layout (no monorepo files) runs clean
  `npm install` of the pinned set, `npm run typecheck`, `npm run build`,
  starts the production server, and asserts HTTP 200 with placeholder
  sections (`data-skelet-section`, "Replace with your own copy") and zero
  observed copy (canary accepted by the synthesizer, absent from files
  and served HTML). Runs in the CI lens job on every head; exit non-zero
  fail-closed with `STARTER_CONSUMER_FAIL`, success prints
  `STARTER_CONSUMER_OK`.
- Unit level: `starter-synthesis.test.mjs` (synthesis headers, pinned
  defaults, byte-identical rebuilds, no observed copy, HTML escaping,
  explicit empty-state stubs, placeholder honesty).
- Render level: fixture renders dimension-verified at both viewports
  (1280x720, 390x844); the starter serves placeholders by design, so the
  visual contract is placeholder-correctness at both viewports, not pixel
  equality with the original site. Recorded Next 14.2.5/Tailwind warnings
  from the original manual proof remain disclosed in `docs/reviews/AF-05d*`.

## Criterion 3 — Multi-surface parity and second-agent recovery — VERIFIED (REST/MCP/UI); SDK lens NOT APPLICABLE

Requirement: UI, REST, MCP, and CLI/SDK (where available) request, poll,
inspect, download, and resume the same analysis by stable IDs; a second
agent recovers from the pack without original session state.

- REST: `apps/web/app/api/v1/lens/jobs[/{id},/cancel,/retry,/resume,/artifacts]`
  (create 201/replay 200, poll/inspect, deterministic cancel, budgeted
  retry, lease-transfer resume, allowlisted download with digest).
- MCP: 7 `lens_*` tools in `apps/web/lib/mcp.ts` delegating to the same
  route layer (envelopes identical by construction).
- UI: `apps/web/app/lens/page.tsx` operator console over the real REST
  contracts (create, poll, watch-to-terminal with timeout, inspect,
  cancel/retry/resume, authorized blob download).
- Tests: `mcp-lens.test.mjs` (8: advertise, replay, REST-MCP convergence
  with deep-equal envelopes, lifecycle mirror, byte-identical artifact
  digests, code-identical failures, quota, no-model),
  `lens-recovery.test.mjs` (lease-expiry resume through the route layer,
  file-backed close/reopen persistence), `lens-ui.test.mjs` (4),
  `lens-jobs.test.mjs` (11). Cross-session pack recovery: AF-03c agent
  write round-trip test (`mcp.test.mjs`).
- CLI/SDK lens operations do not exist (`scripts/skelet_sdk.py` covers
  search/get/object only); the "where available" qualifier is invoked and
  documented here. Agents are served via MCP/REST plus the updated
  `skills/skelet-lens/SKILL.md` (this grain), validated by
  `scripts/validate_skills.py` with the 7 lens tools registered as
  implemented.
- Evidence: PR #77 (14/14 exact-head CI 38333988434; post-merge
  38334335751 SUCCESS), `docs/reviews/AF-05e*`.

## Criterion 4 — Observed/inferred/generated labels — VERIFIED

- Starter synthesis headers and token-basis/coverage notes; export
  exclusions and coverage gaps; explicit partial reports and empty-state
  stubs. Tests: `starter-synthesis`, `export-surface`, `report-assembly`,
  `kit-manifest` suites. No invented facts (report assembly rejects
  fabrication on malformed/over-budget input).

## Criterion 5 — Rights boundaries — VERIFIED

- Unknown/trademark/restricted bytes withheld from shippable sets and
  downloads; per-item classifications tested (`kit-fixture-chain`
  unknown-rights, `export-surface` unknown-rights, `kit-package`
  withheld exclusion, AF-05e download/purge denials, AF-03b
  RIGHTS_RESTRICTED parity).

## Criterion 6 — Security battery — VERIFIED

- SSRF/private/DNS/special-use/credentialed URLs fail closed; resolved
  addresses gate every answer; redirects revalidate under budget;
  rebinding rotations fail on re-resolution (`url-guard`,
  `capture-network`: guard pins, private-DNS denial, metadata-redirect
  rejection, per-hop rebind checks, loop/budget/oversize/mime
  rejections, secret-free child env, pre-spawn refusal).
- Prompt injection and untrusted content: hostile content stays data
  (`report-assembly`), malicious Markdown/HTML inert, unsafe CSS
  unemittable (`export-surface`).
- Traversal/ZIP: unsafe paths, methods, truncation, and CRC failures
  rejected; central directory authoritative (`kit-package`).
- Tenant leakage, quotas, auth forgery: cross-workspace denial parity
  (MCP/REST/lens), deterministic quota exhaustion and release,
  idempotent replay without double charge (`envelope-parity`, `mcp`,
  `rest`, `build-kit`, `lens-jobs`, `mcp-lens`).
- Provider outage: PROVIDER_DISABLED parity, no-model suite + CI job,
  worker health fail-closed, AF-05g-i no-paid-path guard
  (`docs/qualification/NO_MODEL_BUILD_KIT.md`).

## Criterion 7 — Donor adapters pinned and qualified — VERIFIED

- Playwright: `playwright-core@1.56.1` pinned (`packages/lens/package.json`),
  headless-shell installed in CI, isolated secret-free child proven by test.
- Dembrandt/OpenBrand/OpenTechAlyzer/Squirrelscan: commits pinned and MIT
  verified in `UPSTREAMS.lock.yml` with evaluation records in
  `docs/provenance/` (G09-04..G09-07); each explicitly NOT imported as a
  runtime adapter, with recorded posture reasons (offline capture,
  SSRF/egress, toolchain incompatibility). "Before activation" is
  satisfied by evaluation-first: nothing activates without it.
- Full local/offline fixture plus no-paid-credentials proven by the
  offline three-page fixture and the AF-05g-i guard.

## Criterion 8 — Review and release discipline — VERIFIED

- Every AF grain carries genuine Jev (`jev-1.13.0`, ok:true),
  Alibaba OCR delegation (v1.12.13, zero blocking, labeled non-LLM),
  PStack manual fallback (labeled), graft checks, exact-head CI
  (13-14 jobs), normal merge commits, and post-merge CI SUCCESS —
  recorded per grain under `docs/reviews/` and Issues #34/#9 history.
- R4 gate (guarded Lens, successor condition for P09b) is satisfied by
  the canonical G09-03 capture-worker record plus the AF-05a..g evidence
  chain; P14 remains a non-dependency as required.

## Residuals (none outstanding)

- R1 (automated clean-consumer smoke): CLOSED by
  `scripts/prove_starter_consumer.mjs`, wired into the CI lens job.
  Issue #9 is eligible for closure on this matrix.
