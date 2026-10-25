# P10-G26 — Ten-PR consolidated integration qualification (Draft only)

**Scope:** Local-only integration rehearsal of Skilit PRs #172–#177, #179, #181, #182 and #183. No release, tag, deployment, publication, external dataset import or paid model/service.

## Immutable ancestry
- Base main: `157ace7fc57aae9e135a368b7bbe1829ae7111ae`
- #177 security: `dbb50851c34ea4b5b23dbc8324f2cc42a8d8a7c5`
- #175 qualified corpus: `8e58d659d9394632b089911f78b0926779cd7e44`
- #176 research search: `14c80209aa28d637714c393732bb95dc5d954f6b`
- #173 Gallery→Flows: `82a7e7b453be2748ac9ed6459f93f280c8d250e8`
- #174 Compare UI: `79fc3be1080a36605e4b6dcd150de46201931f4e`
- #172 competitive benchmark: `e6af1b1fdfd0a88733e9c044be90ebfbcdbd3856`
- #179 Bearer header ReDoS hardening: `69e06fa915e73f7803921c51b8c4134735e058b8`
- #181 linear SVG guard hardening: `f9017c3cde12198916df870ea338945d0234d325`
- #182 content-addressed temp inode/storage hardening: `79cf7b27d8011ff491e6bffb9041ffe5f9111ea8`
- #183 PGlite local directory symlink/permission hardening: `740589b6a5a54680fdb01d5616e3b15902000806`

## Rehearsal and conflict resolution
Applied these branches in the order above in a detached, disposable Mac worktree. All applied without conflict except #174 after #176. Preserve **both** Research and Compare navigation links in `apps/web/components/skilit-shell.tsx`, preserve both page-specific CSS blocks with separate closed responsive media queries in `apps/web/app/globals.css`, and preserve both Chromium smoke steps in `.github/workflows/ci.yml`. Dropping either navigation entry or one smoke would be an unacceptable resolution.

After the initial six-PR qualification, added #179 as another local merge commit, without conflicts. Rechecked the combined MCP parser and qualified import→search→compare test suite: **13/13 PASS**. This was the initial seven-source stage; later security changes have been integrated subsequently.

This integration branch contains temporary local merge commits joining the respective source-PR histories. **Do not treat its composition as independent review or acceptance of any source PR.** Treat source PRs and this consolidated Draft as alternatives for an eventual qualified integration path; do not merge both the consolidated candidate and all source PRs redundantly.

## Evidence
- Every source PR completed its own exact-head GitHub CI successfully (15/15 jobs). This does not by itself guarantee compatibility on the consolidated HEAD.
- PGlite and Node cross-feature targeted checks: **30/30 PASS** on the combined codebase.
- DB, Assets, Ingest and Web TypeScript checks, web ESLint, and production Next.js build: **PASS**.
- Built Chromium research search, compare UI, and Gallery→Flows journeys: **PASS**, each across three viewport widths.
- `apps/web/tests/integration-qualified-screen-journey.test.mjs`: two real-PGlite source-to-UI-contract tests, using only **synthetic screens** with test rights evidence. It verifies curator-provenance import, actor-scoped `kinds=screen` lookup, parsing by the actual Research UI contract, REST compare, parsing by the actual Compare UI contract, object lookup and persisted `rightsEvidence`. **2/2 PASS** on current integration candidate. The second test validates workspace-public actor isolation across qualified corpus import, screen search facets and compare authorization (outsider denied, member admitted). No real competitors or external assets are imported.

The cross-feature test is source-backed by Skilit's own ephemeral synthetic data only. It is not a copyright clearance, independent competitor benchmark, semantic search or proof of superiority over Mobbin/Refero.

## Required future gates
1. Run GitHub CI on **this consolidated HEAD**; six green source PRs are not enough.
2. Perform independent PStack four-bar reviews, especially security of actor-scoped reads, workspace-public metadata, SQL search/similarity, import deserialization and session handling. Author D1 cannot approve its own security patch.
3. Complete official delegated Alibaba OCR review, inspect Graft blast and verify CI security/regression matrix on the consolidated HEAD.
4. Establish rights-clearance and provenance for a **real** screen corpus; run pre-registered comparable trials against competitors on genuinely available data.
5. No merge to protected `main`, release, tag or deployment without the required approvals and release instruction.

The integration candidate is a testing aid, not a shipping artifact.

## Supplemental free static security analysis

GitHub native CodeQL default setup was enabled for this **public** repository on 2026-10-25, using the `extended` query suite for GitHub Actions, JavaScript/TypeScript and Python. GitHub setup run `40171063239` completed successfully. CodeQL is a distinct machine-generated static analyzer; a successful setup **does not** mean that an analysis of this candidate has completed, detected no alerts, or satisfied PStack. The candidate requires its own scan and a human-quality independent PStack review under the existing governance. Public-repo scanning is available without a paid GitHub Code Security entitlement.

## CodeQL findings / follow-up

As of 2026-10-25, CodeQL discovered 32 open, pre-existing baseline alerts on protected main (`157ace7`): 1 tool-labeled critical, 31 tool-labeled high. These findings are tracked in [Issue #180](https://github.com/TheHalfMoon/Skilit/issues/180) and are **not** 32 verified exploits. The focused #179 fix addresses `js/polynomial-redos` alert #10, whose exact PR head has no corresponding CodeQL instance. The integration candidate must be scanned again on **its new exact head**; prior scans of six-PR code must not be reused.

## Latest eight-source integration hardening

Integrated PR #181 with a separate local merge, without conflicts. The combined PGlite research admission/search/compare and vector/OpenPencil security suites produced **49 passed / 1 pre-existing genuine-binary skip / 0 failed**. Strict Editor Adapters and Web TypeScript checks passed.

CodeQL six inherited `js/polynomial-redos` alerts #11–#16 have **zero instances on `refs/pull/181/head`**, but remain visible on protected `main` until a qualified merge. Latest consolidated HEAD requires **new** CI and CodeQL results; successful scans for the prior seven-source HEAD do not apply to it. Remaining CodeQL baseline alerts remain tracked by Issue #180, and independent PStack security review remains mandatory.

## Ninth source: verified storage publication

Integrated Draft PR #182 without conflicts into the consolidated candidate. The combined real-filesystem storage, source→search→compare PGlite and SVG safety tests **18/18 PASS**, with strict Storage TypeScript and ESLint passing. Storage regression proves a source callback substituting a symlink under a temporary upload pathname fails closed, and the published target must remain the verified inode.

**The ninth-source candidate must run its own CI and CodeQL.** The previous eight-source 15/15 and 3/3 results do not apply to this new HEAD. Independent PStack review remains incomplete, as do remaining baseline CodeQL triage and real rights-qualified corpus and competitor trials. No deployment, publication, release or paid provider.

## Tenth source: PGlite local data-directory symlink protection

Integrated Draft PR #183 with a Git tree-based, two-parent commit, preserving both the existing nine-source integrated history and the exact #183 source commit. The two changed web files matched protected main exactly before this integration; no functional conflict was discarded. On the source PR's exact head, GitHub CI **15/15 SUCCESS** and CodeQL **3/3 SUCCESS**. New POSIX regression refuses a final-component symlink to an unrelated directory without modifying its permissions; real private directories still initialize and tighten to owner-only. A fresh exact-head CI/CodeQL run on this ten-source candidate is **required**; source PR green results do not substitute. Windows retains a guarded but weaker path-based chmod fallback and requires separate review. No paid tools, release, deployment, or merge to main.
