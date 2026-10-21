# P00-G16 Authenticated Browser E2E — PStack Review Panel

- Grain: `P00-G16` — prove a real authenticated browser journey on an isolated database.
- Branch: `skilit/p00-g16-authenticated-browser-e2e`
- Canonical base SHA: `c6f687dec480f8c7ea76531d149a8105c1f0f02c` (the merge of the approved
  brand identity, PR #163)
- Reviewed candidate HEAD: `47424791152a21b2f18bd9891f47b07a00aaf60b`
- Reviewed diff: `origin/main...47424791152a21b2f18bd9891f47b07a00aaf60b` — 8 files, 1105
  insertions, 12 deletions.
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.2.
- **This is a security-trigger grain**: the diff is about authentication, sessions,
  workspace isolation and authorization denials. Decision §3.4 forbids a degraded
  self-review for such a grain, so the security bar was judged by a dedicated independent
  fresh-context security judge in every round, and the split panel was used rather than
  the default combined one.
- Judges: **five independent fresh-context judge sessions** — three dedicated security
  rounds, one combined correctness/parsimony/product round, and one final all-bars
  verification round. No judge authored the diff.
- Degraded level: **none**.

## Panel manifest

```
panel: full — correctness ✓ (fresh-context judge) · parsimony ✓ (fresh-context judge) ·
product ✓ (fresh-context judge) · security ✓ (dedicated fresh-context security judge) ·
deltas: three independent fresh-context security delta re-reviews ✓ ·
base c6f687dec480f8c7ea76531d149a8105c1f0f02c · reviewed candidate 47424791152a21b2f18bd9891f47b07a00aaf60b ·
merge candidate: the commit carrying this record
```

The merge candidate differs from the reviewed candidate `4742479` only by this record and
`docs/reviews/P00-G16_OCR_DELEGATION.md`, both Markdown: they are excluded from Alibaba
OCR's reviewable set and are not indexed by Graft, so neither changes the review outcome
or the applicability evidence below.

## Findings and disposition

### Security round 1 — one must-fix, four worth-considering, two skips

- **MUST-FIX — the isolation guarantee was defeatable, with a write consequence.**
  `next start` loads `apps/web/.env*` into the process environment for keys that are not
  already set, so stripping the database URL variables from the inherited environment was
  not enough: an `.env.local` on the developer's machine could repopulate the very key the
  smoke removed. The URL takes precedence over the disposable data directory, so the
  server would have opened that database and the bootstrap journey would have created an
  owner account, a workspace and a board in it. **Fixed**: the smoke now pre-flights the
  four Next.js environment files and refuses to run, with a non-zero exit, when any of
  them declares a database URL. The precedence in `databaseOptions()` is deliberately
  unchanged, because flipping it to prefer the data directory would silently redirect a
  real deployment that sets both. Verified by creating the offending files: the smoke
  refuses with exit 1 and names the file and the variable.
- **WORTH — the read path did not prove non-enumeration.** **Fixed**: the isolation
  fixture now creates a real board inside the other actor's real workspace, the unknown
  workspace is read with the identical request shape and the two answers are compared,
  and a single board in the other actor's workspace is read and refused.
- **WORTH — the guard against a token reaching the CI log ran after the output had
  already been echoed.** **Fixed**: the output is redacted on the way out, and the
  post-hoc assertion is kept as well.
- **WORTH — an interrupt left the server running and its disposable data directory
  behind, with password verifiers and session material in it.** **Fixed**: SIGINT and
  SIGTERM tear the run down.
- **WORTH — the PGlite data directory accepted an arbitrary path with no permission
  enforcement.** **Fixed**: the path must be absolute, and the directory is created
  owner-only before PGlite opens it.
- **SKIP** — the bootstrap scenario's denied workspace id does not exist; the wording now
  says "a forged workspace id". **SKIP** — the `Secure` cookie attribute cannot be
  asserted over plain HTTP, and the smoke's claims are scoped accordingly.

### Security round 2 — zero must-fix, four worth-considering, one skip

- **WORTH** — the owner-only mode was only applied at creation, so a pre-existing
  directory kept its old permissions. **Fixed** with an explicit `chmodSync`, and proved
  by tightening a 0755 directory to 0700.
- **WORTH** — the redaction matched its secrets as plain strings, so only the first
  occurrence in a chunk was redacted, a secret split across chunks was not redacted at
  all, and the expiry token was not covered. **Fixed**: the redaction moved into
  `scripts/lib/log-redaction.mjs`, the literals are global patterns, the carry-over buffer
  is sized from the longest known secret, and the expiry token is registered. Nine unit
  tests cover every occurrence in a chunk, a secret split at every possible split point, a
  runtime secret registered after the first chunk, the session cookie shape, the
  held-back tail, an empty secret, and regular-expression metacharacters.
- **WORTH** — the teardown cleared the server slot before the SIGKILL timer fired, so the
  escalation could never fire. **Fixed**: the timer holds the child itself, and the exit
  is scheduled on a ref'd timer across the escalation window.
- **WORTH** — the read-path assertions only checked the status. **Fixed**: the denial
  code is asserted, and a positive control reads the actor's own board through the same
  item route and expects 200, so the denials are provably authorization decisions.
- **SKIP** — the throwaway server bound all interfaces. **Fixed**: it is now bound to
  loopback only.

### Combined correctness, parsimony and product round — one must-fix, three worth, four skips

- **MUST-FIX — the CI contract contradicted the workflow it describes.** The document
  still said the `web` job ran with a 15-minute timeout while the workflow sets 30.
  **Fixed**.
- **WORTH — the expiry budget could be consumed by startup latency.** The first fix
  attempt lengthened the backdate but left the margin unchanged, because the remaining
  lifetime is the TTL minus the backdate and is measured from before the server boots.
  **Fixed properly**: the fixture keeps a 600-second session backdated by 510 seconds, so
  about 90 seconds of real lifetime remain — roughly fifty times the observed startup
  cost — and the comment states what is actually true.
- **WORTH — two identical password constants.** **Fixed**: one `PASSWORD` constant, so
  the redaction assertion is one assertion rather than one assertion tested twice.
- **WORTH — the header claimed "every read and write" against the other actor's
  workspace, but only the board collection, board creation and board item reads are
  exercised.** **Fixed**: the wording now names those paths.
- **SKIP** — a redundant comment guard that could never fire. **SKIP** — the CI comment
  said the server boots "twice"; it boots once per scenario. **SKIP** — the header said
  "human UI journeys" although the denial probes are HTTP calls made from the browser
  context. All three fixed.

### Final verification round — all four bars

The final round re-read the whole grain with fresh eyes and confirmed that every finding
above is resolved, that the documentation matches the code, that no assertion is vacuous,
and that the CI wiring is correct. It found one further must-fix — the CI contract
sentence describing the expiry fixture, which the previous fix had made stale — and one
further worth-considering finding, the expiry margin, both fixed as described above.

## Correctness — PASS

- The smoke passes against the production build with exit 0, and leaves no disposable
  directory behind.
- **The assertions are not vacuous.** The panel proved this by mutation in scratch
  copies: removing the `expires <= now` guard from `validateSession` makes the smoke fail
  on the expiry assertions; making the board read route answer `403 RIGHTS_RESTRICTED`
  for a real but unowned workspace makes the smoke fail on the non-enumeration
  comparison; dropping `HttpOnly` from the session cookie and answering "No account with
  that email." for an unknown email makes the smoke fail on the cookie and
  identical-message assertions. Each mutation was reverted and the smoke passed again.
- The error envelopes, status codes and success shapes asserted match the canonical
  contract in `apps/web/lib/agent-contract.ts`: `FORBIDDEN_OR_NOT_FOUND` to 404,
  `INVALID_INPUT` to 400, `UNAUTHENTICATED` to 401, and `{result: {...}}` on success.
- The session expiry is real, not client-state manipulation: `createSession` writes a real
  `expires_at` and `validateSession` enforces it, the browser holds the cookie across the
  genuine expiry instant, and both the cookie and the Bearer presentation are then
  refused.
- Sign-out revocation is real: the original token is re-presented as a Bearer and is
  refused with 401.
- Non-enumeration is real at the product layer: an unknown email and a wrong password
  produce the same message, and a workspace the actor cannot see and a workspace that
  does not exist produce byte-identical error envelopes.
- The PGlite data directory invariant has its own test: a relative path fails closed, a
  fresh directory is created owner-only, an existing world-readable directory is
  tightened to owner-only, and a nested directory is created owner-only.

## Parsimony — PASS

- Every added file is load-bearing: the smoke, the redaction module, two test files, the
  database-selection change, the CI step, and the two documentation rows.
- The redaction module is 67 lines and shared by the smoke and its test; the extra
  structure is what makes the split-chunk case testable.
- One credential constant, one exported `prepareDataDir` helper, one `.env` pre-flight
  loop, no duplicated fixture logic, no dead code.

## Product completeness and specification alignment — PASS

- The grain's objective is met by execution, not assertion: real pinned Chromium, a real
  `next start` production server, three disposable PGlite databases, three scenarios,
  real form submission for owner bootstrap and for actor sign-in, a real database-backed
  session expiry, and the isolation denials proven non-enumerating by comparing the
  envelopes.
- The header's claims now match the code: the isolation scenario names the three
  operations it exercises, and the bootstrap scenario says "a forged workspace id".
- `docs/operations/CI.md` and `docs/operations/CLEAN_INSTALL.md` now describe the
  committed behaviour: the 30-minute job timeout and why, the 600-second session
  backdated by 510 seconds, and the absolute-path owner-only data directory contract.

## Security and privacy — PASS

- **No path to a real database.** The two URL variables are stripped from the server
  environment, the four Next.js environment files are pre-flighted and a declared URL
  aborts the run with exit 1, `openDatabase` reads only its explicit options, and the
  prepare child passes its data directory explicitly.
- **No path to a real user.** Accounts, workspaces and boards exist only in the
  disposable directory, which is created owner-only and removed on exit and on interrupt.
- **No public network egress.** The server is bound to loopback only, the browser only
  navigates to 127.0.0.1, and the application has no telemetry or external asset.
- **No secret in logs or artifacts.** The session token is written to a 0600 file inside
  the 0700 directory, never printed, redacted on the way out, and asserted absent from
  the captured output; the passwords and the cookie value are redacted too, and the
  output is asserted not to contain them.
- The CI change adds no secret, no unpinned action and no `continue-on-error`, and
  weakens no existing step.

## Mechanical evidence

- Python suite: `TZ=UTC python3 -m unittest discover -s tests` — **288 tests, OK**.
- Node suites: `node --experimental-strip-types --test "tests/node/*.test.mjs"
  "apps/web/tests/*.test.mjs" "apps/worker/tests/*.test.mjs"` — **223 tests, 223 pass,
  0 fail**.
- `pnpm --dir apps/web lint` — clean. `pnpm --dir apps/web typecheck` — clean.
- Repository hygiene: `python3 scripts/ci_hygiene.py --expected-head 47424791152a21b2f18bd9891f47b07a00aaf60b`
  — `CI_HYGIENE_PASSED tracked_files=1059`.
- The smoke itself, against the production build: `node scripts/smoke-auth-journey.mjs 3115`
  — **exit 0**, `SMOKE_PASSED authenticated browser journeys (bootstrap status, signup,
  workspace, isolation, enumeration, sign-out, expiry, session recovery)`, no
  `skilit-auth-journey-*` directory left behind.
- Graft `0.21.1`: `graft build --no-gitignore --no-ignore .` exit 0; `graft check .` —
  `graph check: OK — the wiring graph is in sync with the code`;
  `graft blast --base origin/main --format markdown` — "3 areas changed → 35 areas can be
  affected. 44 dependent symbols, depth 2", the blast running through `getSharedDb`,
  which every web route uses. Two changed areas updated their tests; the changed CI and
  documentation files are outside the graph.
- **Graft coverage limitation, stated explicitly:** Graft's parsers cover JavaScript,
  Python, TypeScript and TSX. Three of the eight changed files — the CI workflow and the
  two documentation files — are outside the graph; the other five are parsed. The blast
  result identifies the affected code and its dependents, which is the point of running
  it against a change to a shared database handle.
- The exact-head GitHub Actions run for this candidate is recorded in the governing pull
  request.

## Verdict

Every finding raised across five independent judge sessions is fixed and independently
re-verified, including the one must-fix that was found by the security judge in the
first round and the one must-fix that was found by the final verification round. The
grain is cleared for merge under the replacement review stack.
