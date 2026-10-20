# Skilit v1 Local Clean-Install Procedure (Canonical, Repeatable)

Status: CANONICAL OPERATOR PROCEDURE. Base: `9d73f79` (PR #143 merge).
Scope: the exact 15-step isolated clean-checkout verification required by the v1 Local release contract (§5). No hidden local state, no developer credentials, no pre-installed dependencies. Machine-checked by `tests/test_clean_install_proof.py` (offline: procedure completeness + proof-record binding). Measured execution is recorded in `docs/qualification/CLEAN_INSTALL_PROOF.md`.

## 1. Supported platforms and versions

| Requirement | Supported value | Evidence |
|---|---|---|
| OS | macOS (local dev, batched proof) or Linux ubuntu-24.04 (CI, combined proof) | `CLEAN_INSTALL_PROOF.md` + CI `bootstrap` job |
| Node.js | `>=20.9.0` per `engines`; CI pins `22.23.1`; local proof records its actual `node --version` | proof record |
| pnpm | `9.12.0` exactly (`packageManager` + CI install step) | `pnpm --version` in proof |
| PostgreSQL | server reachable at `127.0.0.1:5432`; fixture database `skilit_test` owned by role `skilit_test` | `pg_isready` + `psql` probe in proof |
| Storage | local filesystem content-addressed store root (path recorded in proof); S3-compatible interface present, local adapter exercised | `packages/storage` suite |
| Windows | NOT claimed beyond the `storage-windows-latest` CI job; no full Windows clean-install claim until a platform-specific proof lands | contract §4 |

Node-version skew note: a newer local Node (e.g. v26) is acceptable for the install proof only when `pnpm install --frozen-lockfile`, validators, and the proof suites all pass on it; CI `22.23.1` remains the authoritative combined proof.

## 2. Required environment variables

| Variable | Purpose | Example |
|---|---|---|
| (none mandatory for install) | frozen install needs no secrets | — |
| `SKILIT_NO_MODEL=1` | no-model gate (worker health + `check_no_model.py --strict`) | proof step 11 |
| `SKILIT_TEST_DATABASE_URL=postgresql://skilit_test:local_ci_fixture_only@127.0.0.1:5432/skilit_test` + `SKILIT_DB_TEST_CONFIRM=yes` | real-PostgreSQL suites only (fixture database, CI-identical credentials) | proof step 9 |
| `SKILIT_MCP_PGLITE_DATA_DIR=<path>` | local PGlite data directory for the web application; use it to keep a service-free local database between restarts. Unset, the web application uses an in-memory PGlite instance. Migrations still have to be applied to the directory first | local development |
| `SKILIT_DOCUMENT_BIN` (legacy `SKILIT_OPENPENCIL_BIN`, `SKELET_OPENPENCIL_BIN` accepted) | genuine-binary adapter runs only (absent = 1 labeled skip, still PASS) | proof step 7 |

No AI provider keys, no cloud credentials, no GPU. The proof must pass with all of them absent.

## 3. The 15-step procedure (execute inside an isolated worktree)

```bash
# 0. Isolate: fresh worktree at the release-candidate SHA, no node_modules, no hidden state.
git worktree add /tmp/skilit-clean-<SHA> <SHA>
cd /tmp/skilit-clean-<SHA>
# 1-2. Record OS + versions: sw_vers/uname, node --version, pnpm --version, psql --version.
# 3. PostgreSQL probe: pg_isready + psql fixture-DB select (read-only).
# 4. Storage config: record the store-root path convention (content-addressed, outside Git).
# 5. Env: confirm no secrets present; set SKILIT_NO_MODEL=1 for gate steps.
# 6. Clean dependency installation (real, timed): pnpm install --frozen-lockfile
# 7. Validators: validate_upstreams.py, validate_skills.py, validate_agent_contract.py,
#    validate_build_kit.py, generate_sbom.py --check, ci_hygiene.py --expected-head <SHA>,
#    python scope suites (test_v1_local_scope, test_cloud_backlog).
# 8. Database setup + migrations: migration-rehearsal suite (up/down/up on scratch hardware).
# 9. Real PostgreSQL suites (each in its own process): pg-integration, pg-graph,
#    pg-workflows, pg-build-kit, pg-backup-restore (15/15 total).
# 10. Worker startup + health: pnpm --dir apps/worker start health (plus SKILIT_NO_MODEL=1 run).
# 11. No-model gate: SKILIT_NO_MODEL=1 python scripts/check_no_model.py --root . (strict).
# 12. Web production build + startup + health: pnpm --dir apps/web build, then
#     scripts/smoke-web.mjs (health + / 200 + shutdown), prove_starter_consumer.mjs,
#     prove_registry_install.mjs.
# 13. Research workflow: golden-journey S0 suite (10-stage fixture journey, no mocks on agent paths).
# 14. Agent workflow: interop suites (HTTP + stdio wire clients + SDK envelopes) + MCP/REST parity.
# 15. Graceful shutdown/restart: smoke script shuts the server down; re-run worker health to prove restart.
```

On an 8 GB Mac, Node suites run in directory batches (see `AF-12_FINAL_RERUN_4.md`); batching is environmental and must be disclosed. CI runs the same suites combined on a fresh runner as the authoritative combined proof. Any failure is release-blocking: fix it in its own governed grain, never by weakening a step.

## 4. Cleanup

```bash
cd <canonical-checkout>
git worktree remove --force /tmp/skilit-clean-<SHA>
```

The canonical working tree is never disturbed: no install, build, or database step in §3 runs inside it. The `.ignore` file stays untracked and untouched throughout.
