# Issue #62 Closeout Report — ArtCraft Selective Transplantation (Evidence, Not a Close Action)

Status: CLOSEOUT EVIDENCE RECORD. Base: `22f8dfb` (PR #145 merge, exact-head CI SUCCESS 15/15, post-merge CI SUCCESS).
Scope: reconcile every Issue #62 acceptance condition (AC-00–AC-04), global gate (1–7), and journey (a–c) against committed evidence; list explicitly deferred optionals, remaining limitations, rights/legal decisions, and the single recommended disposition. **This record does not close Issue #62.** Closing requires the explicit owner authorization OD-03; no close action is taken here. Machine-checked by `tests/test_issue_62_closeout.py` (offline).

Review-stack superseding note (2026-10-21, `GD-2026-10-21-REVIEW-STACK`): global gate (5) now names the PStack review panel in place of Jev; no other Jev reference remains in this record.

## 1. Acceptance conditions vs evidence

### AC-00 — Qualified inventory and import design: SUBSTANTIALLY COMPLETE (conditional remainder)
- AF-01 audit (PR #67): all 8 craft donors ready-pinned with trees, licenses, NOTICE identities, candidate paths, dependency closures, include/exclude manifests; code rights separated from data/asset/model/service/trademark with quarantine prefixes. No runtime code imported.
- AC-00-i moodboard closure (PR #95): 70 SHA-verified files + 8 externals at the artcraft pin; SmartSearchBar excluded; no transplant authorized.
- AC-00-ii frame-extractor closure (PR #108): 2 frozen files at the services pin `02a3de2` with live-verified SHAs (zero-import candidate + excluded provider-coupled sibling); confirms the module lives only in artcraft-services (restrictive Fair Source/WIP; reuse rides on founder authorization); 8 offline conformance tests.
- AC-00 perf leg (PR #114): `bench_board_changes.mjs` + CI schema proof; board-adjacent read latencies environment-relative; rollback criterion measurable.
- AC-00 bundle leg (PR #136, `BUNDLE_BASELINE.md`): shared 103 kB / heaviest route 106 kB; budgets 120/140 kB enforced on the web CI job's own build output.
- Remainder (conditional): frozen fixtures + per-file manifests for post-launch candidates, required **only if** their transplants activate (none planned). Latency baselines exist; Web Vitals lab work stays out of scope.

### AC-01 — P10 video reference import: DECIDED KEEP (PR #109, `AC-01_VIDEO_FRAME_DECISION.md`, 7 machine-checked tests)
Skelet-owned bounded frame engine retained over donor `extract-frames.ts` on six measured grounds (no dependency win, stricter bounds, deterministic timestamps, PNG-vs-JPEG incompatibility, layer-mismatch cost, covered cancellation), with a two-case revisit trigger. No transplant performed.

### AC-02 — P12 reference boards: DECIDED KEEP (PR #110, `AC-02_BOARD_DECISION.md`, 8 machine-checked tests)
Skelet-owned ordered-collections board retained over the moodboard transplant on five measured grounds (sync core would be discarded, foreign state stack for unneeded richness, no handoff/rights counterpart, grid lead insufficient, keyboard parity), with two revisit triggers. No transplant performed.

### AC-03 — P14 vector/raster adapters: QUALIFIED (genuine-binary closed, bounded remainder)
- VectorCraft headless adapter (AF-10, PR #89) + genuine-binary qualification at pin `6c3f9f6…` (`VECTORCRAFT_BINARY_QUALIFICATION.md`).
- PhotoCraft headless adapter (AF-11, PR #90) + genuine-binary qualification at pin `9713648…` inclusive of two genuine argv defects the fixtures missed, repaired with regressions (PR #97, `PHOTOCRAFT_BINARY_QUALIFICATION.md`).
- OpenPencil provider evaluation (PR #112: live HEAD `78355fd`, 0.16.0, MIT; headless CLI + fig/pen shortlist; app-bridge/desktop rejected) + headless adapter grain (PR #121: allowlisted file-mode CLI, pack-to-pen-to-export-to-reopen journey on fixtures, genuine-binary conditional test) + genuine-binary qualification (`OPENPENCIL_BINARY_QUALIFICATION.md`: 20/20 with `SKELET_OPENPENCIL_BIN`, 6 allowlisted ops, `.pen`/`.fig` handling, fig round-trip, no code fix required).
- Remainder (bounded): `.fig` fidelity at scale is per-document by design; PageDraw primitives stay deferred pending gap proof (P14 trigger in `CLOUD_COMMERCIAL_BACKLOG.md` CB-10).

### AC-04 — Post-launch evaluation: DISPOSITIONED (PR #111, `AC-04_POST_LAUNCH_DISPOSITION.md`, 4 machine-checked tests)
All five candidates (DesignCraft layouts, EffectCraft Lottie, film/video timeline, LightCraft metadata, PageScene 3D) DEFERRED with measured triggers, rights preserved, pins traceable. No launch delay.

## 2. Global gates (1–7)

1. No architectural inversion: HOLDS (PostgreSQL/graph/storage/auth/quota/MCP/REST/rights authoritative; no MySQL/Redis/Elasticsearch transplant).
2. Rights fail closed: HOLDS for implemented paths, incl. the AF-14c similarity-gate fix (PR #117) that closed a real cross-tenant leak class; source-code permission never implies dataset/asset/model/trademark rights; per-item classification + pins + hashes enforced.
3. Agent parity: HOLDS for implemented objects via stable `skelet://` URIs (30 tools + REST parity); single-shot analysis and Apps views remain parity gaps with authorized dispositions, not passes.
4. Performance: HOLDS for baselines (search + board/changes/import benches, bundle budgets enforced); rollback criterion measurable; production-scale proof is Cloud scope (CB-13).
5. Tests/reviews: HOLDS per grain (PStack panel with independent fresh-context judges or an explicitly labelled degraded review, delegate-only OCR labeled non-LLM, Graft, exact-head CI, normal merge, post-merge CI).
6. No launch disruption: HOLDS (no giant PR, no force-push/rebase, no change to uncommitted owner work; `.ignore` preserved untracked throughout).
7. Identity: HOLDS (user-facing brand is Skelet; upstream copyrights + required attribution preserved in provenance). Root `NOTICE` consolidation + Skelet license choice remain OD-05 (see `RELEASE_CANDIDATE.md` §6); this is a release-packaging remainder, not an AC-03/AC-04 gap.

## 3. Journeys

- (a) Video → timestamped evidence artifacts/flow: PARTIAL-PASS on the Skelet-owned frame path (fixtures; `video-frame-evidence` + attachment suites), not on ArtCraft code — by AC-01 KEEP decision.
- (b) Search/Lens → collaborative reference board → reload → cross-agent reference pack: PARTIAL-PASS on the Skelet-owned board (board/REST/MCP/UI parity + handoff ledger + golden journey), not on transplanted moodboard — by AC-02 KEEP decision.
- (c) Reference pack → permissioned editable SVG via headless VectorCraft → back into Skelet assets: PASS for VectorCraft/PhotoCraft at pins (genuine-binary qualifications supersede fixture-only) plus the genuine OpenPencil leg (pack-to-pen-to-export-to-reopen + fig round-trip).

## 4. Explicitly deferred optionals (not counted complete)

Post-launch candidates (CB-18); PageDraw transplant (CB-10); fig-at-scale guarantees (CB-10); live capture recorder (CB-04/OD-01); Apps views (CB-02); embeddings/hybrid (CB-06–CB-08); watch/scoring (CB-09); production storage/dashboards/load/signing-identity (CB-11–CB-14); managed hosting/enterprise/datasets (CB-19/CB-01/CB-15–CB-17). Full triggers in `CLOUD_COMMERCIAL_BACKLOG.md`.

## 5. Remaining limitations

- Fig fidelity is per-document; no at-scale guarantee is claimed.
- Journeys (a)/(b) exercise Skelet-owned paths on fixtures, not transplanted ArtCraft modules and not a live-capture corpus.
- Web Vitals lab work is out of scope (bundle budgets enforced instead).
- Root `NOTICE` consolidation + Skelet license selection pending OD-05.

## 6. Rights/legal decisions

- Dual-licensed artcraft snapshot preferred for byte-identical modules (8 sampled files hash-confirmed); services-only `extract-frames.ts` reuse rides on the founder-reported authorization recorded in Skelet's authorization/provenance record — precise rightsholder/third-party scope must be verified before any services-only import is activated (no such import has been activated).
- `vectorcraft`/`photocraft`/`designcraft`/`effectcraft`/`filmcraft`/`lightcraft` workspaces declare MIT OR Apache-2.0; leaf crates + bundled assets must be rechecked before any import beyond the qualified headless adapters (no such import planned).
- No proprietary third-party resources (game sounds, character/meme images, skyboxes, brand marks, model weights, API credentials, provider assets) are redistributed; donor datasets/brands/assets excluded at import and rights-gated at serving.

## 7. Recommended disposition (single exact decision for OD-03)

Close Issue #62 on the current evidence with the caveats of §§4–6 recorded (per-document fig fidelity; post-launch candidates conditional; journeys (a)/(b) partial-pass on Skelet-owned paths; OD-05 NOTICE/license remainder tracked in `RELEASE_CANDIDATE.md`), **or** the owner names the additional proof required (which AC, which module, which metric). I will not close this issue without that explicit authorization.
