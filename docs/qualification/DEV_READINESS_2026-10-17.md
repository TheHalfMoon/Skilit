# Skilit Development-Readiness Scorecard — 2026-10-17

Base: `3c31e35` (PR #157 merged; post-merge CI success). Scope: the adopted
local development plan only — the long-term commercial/cloud vision in
`PRODUCT.md` is explicitly out of scope for these ratings. Percentages appear
only where explicit measurable acceptance criteria exist; everything else is
stated as gates with evidence.

Review-stack superseding note (2026-10-21, `GD-2026-10-21-REVIEW-STACK`): the Jev mention below is a historical observation of 2026-10-17 and is preserved verbatim. The same note covers the PStack and Alibaba mentions in item 4 of §10: they too were true on 2026-10-17 and were superseded on 2026-10-21, when the zero-cost review stack replaced the metered gate. Both now run — the PStack review panel and the Alibaba Open Code Review delegation — and their evidence is under `docs/reviews/`. For the account-session grain (`P00-G18`) the panel record is `docs/reviews/P00-G18_PSTACK_PANELS.md` and the delegation record is `docs/reviews/P00-G18_OCR_DELEGATION.md`.

No release, no tags, no deployment were performed. All browser/database proof
used isolated scratch resources, destroyed afterwards.

## 1. Engineering completion

| Area | Evidence (2026-10-17) | Gate |
|---|---|---|
| CI | 15/15 jobs green on `3c31e35` (post-merge) and on PR heads #155/#157 | PASS |
| Unit/integration suites (local Mac) | web 157/157; node+worker 36/36; lens 197/197; assets/ingest/providers/storage/sdk/no-model/adapters 157 pass + 1 labeled skip/158; db workspaces 7/7 | PASS |
| Lint/typecheck/build | `eslint`, `tsc --noEmit`, `next build`, bundle budget (shared 120KB / route 140KB), `validate_agent_contract`, no-model gate, `graft check` clean | PASS |
| Live URL→design capture | `analyzePublicUrl('https://example.org/')` end to end in 1.5s: status `partial` (honest on a 577-byte page), 7-artifact bundle (lens.json, DESIGN.md, tokens.dtcg.json, tailwind.theme.js, shadcn-theme.css, AGENT.md, manifest.json), DTCG colors/fontSizes/spacing/radius extracted | PASS |

## 2. Functional coverage (adopted scope)

- Auth/sessions/workspaces/collections/boards/flows/replays/patterns/gallery/assets/lens-jobs: covered by domain suites plus REST↔MCP parity (`envelope-parity`, `golden-journey`, interop stdio/HTTP). No open functional gap found in the adopted scope.
- First-party browser sign-in (Issue #152 implementation): delivered in #157 — bootstrap-only signup, HttpOnly cookie sessions, sign-out revocation, whoami/expiry recovery, CSRF/origin checks, 9 DB-backed + 3 UI-contract tests, 16/16 real-Chromium E2E on an isolated scratch DB. Issue left open for founder closeout only.
- Deliberately deferred (recorded, not gaps): cookie-first data pages, operator invite flow. The session list/revoke-all UI is no longer deferred: it was delivered with the account surface (`/account`, `GET`/`DELETE /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/{id}`).

## 3. Agent/MCP readiness — PASS

30 MCP tools over Streamable HTTP + stdio bridge, canonical `skilit.agent.v1` envelope shared with REST, cursor pagination, idempotency keys, capability advertisement, deterministic error catalog. TS + Python SDKs tested (stub-fetch + live parity suites). No MCP/REST behavioral inconsistency found.

## 4. Browser UX readiness — PASS with noted follow-ups

/login + /signup + home links ship; labeled native controls, assertive errors, aria-live status, keyboard-operable. Data pages still accept operator Bearer input (cookie works underneath; proven by E2E fetch). Cookie-first inputs are the queued follow-up, not a launch blocker for local use.

## 5. Security — PASS (reviewed 2026-10-17, gates below)

- AuthN/Z: scrypt+N verification, SHA-256-hashed opaque sessions, generic failures, no-oracle denials, last-owner guard, row-locked rosters — all covered by tests.
- Web session layer (#157): bootstrap race fixed (reproduced dual-201, now single locked transaction + regression test); enumeration/CSRF/revocation/expiry covered.
- SSRF/URL handling: spot-checked numeric/hex/IPv4-mapped bypasses — all normalized by WHATWG URL and blocked; DNS-pinned fetch; per-hop redirect guards. No bypass found.
- Reviewed and ruled out (not defects): Build Kit quota double-release (single-fire sites, serialized by row locks), error-message oracles (static catalog + dummy scrypt).
- Dependencies: `pnpm audit` high = 1 (braces via eslint-config-next, dev-only transitive, already dispositioned in `DEPENDENCY_SCAN.md`, unpatched upstream). No production-path exposure.
- Secrets: none committed; session tokens/cookies never logged (code-read verified).

## 6. Performance — baselines recorded, no blocker

Environment-relative (Apple Silicon Mac, Node 26, PGlite unless noted). Authoritative SLO proof remains CI + release-candidate runs.

- signUp 40ms / signIn ~37ms mean, identical for unknown emails (scrypt N=16384).
- Rate limiter ~3.25M checks/s mixed keys; eviction bounded at 5,000 keys.
- Cursor codec 50k encode+decode ~29ms. Concurrent bench: parallel search ~1.45s, over-budget refuse ~131ms.
- Lexical search p50 ~10ms per `SLOS.md` baseline; live capture example.org 1.5s end to end.
- No optimization was justified: headroom exceeds 10x on every measured path. Rule enforced: no benchmark-driven change that risks correctness/security/determinism.

## 7. Documentation — PASS

`PRODUCT.md`/`ARCHITECTURE.md`/`SECURITY.md`/runbook/SLOs consistent with the implementation (verified: capture-worker cookie ban and log-redaction rules unaffected by the session layer; home page no longer overstates sign-in absence). Provenance and qualification records preserved; legacy `skelet` strings exist only in frozen history, compat shims, and the rename migration.

## 8. Integration stability — PASS

MCP/REST/SDK/CLI envelope parity suites green; stdio + HTTP interop suites green; registry install proof + starter-consumer proof green in CI. No transport inconsistency found.

## 9. Release readiness — NOT GO (by founder directive, not by defect)

No release published, no tags created, no deployment performed — per standing founder rules. The v1 Local RC artifacts remain untouched. From a pure engineering standpoint the adopted local scope meets its gates; the GO/NO-GO decision and any tag/publish remain explicit founder actions.

## 10. Open items and constraints

1. Issue #152: implementation merged; founder closeout pending (no code required).
2. Issue #34: autonomous program record (informational).
3. Queued follow-ups: cookie-first data pages, operator invites. The session list/revoke-all UI is delivered.
4. Tool limits honestly recorded: Jev/PStack/Alibaba review unavailable (no keys/access); graft, full CI, Playwright/Chromium, ESLint/TypeScript, migration rehearsals, and real-PostgreSQL suites used instead.
5. Windows: only the `storage-windows-latest` CI job claims coverage (per `CLEAN_INSTALL.md`); no full Windows install claim is made.
