# P00-G18 Account Sessions — PStack Review Panel

- Grain: `P00-G18` — let an account see and revoke its own sessions.
- Branch: `skilit/p00-g18-account-sessions`
- Canonical base SHA: `2b053d351385e5100f69494247d8aa42fe8a84be` (the merge of the
  authenticated browser E2E, PR #166)
- **Reviewed candidate HEAD: `8ec23c435b742d1404276497cdea768322f6f6a9`** — the code state
  that ships.
- The review rounds ran over a sequence of candidates: rounds 1 and 2 over
  `a86565f7b64c341251b2678cb0d34917d22d7532`, round 3 over
  `a84ceb4bfae59019184ddc2f388155dea9a043f0`, and the final round over
  `c5dc98c188475eae930085fcece1e45e01fe0ae6` and `8ec23c435b742d1404276497cdea768322f6f6a9`.
  Every commit between the base and the reviewed candidate was covered by one of those
  rounds; the table under §Findings and disposition names which round covered which
  commit.
- Reviewed diff: `origin/main...8ec23c435b742d1404276497cdea768322f6f6a9` — 20 files,
  2482 insertions, 14 deletions.
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.4.
- **This is a security-trigger grain**: the diff is about authentication, sessions and
  authorization denials. Decision §3.4 forbids a degraded self-review for such a grain,
  so the security bar was judged by a dedicated independent fresh-context security judge
  in every round. The split panel runs *in addition to* the combined one under decision
  §3.2, not instead of it, and the final-candidate combined judge answered all four
  bars — including security and privacy — in a single read, as §3.3.1 requires.
- Judges: **twelve independent fresh-context judge sessions** — five in the first round
  (a dedicated security judge, two correctness judges over the data/REST and UI/test
  surfaces, a parsimony judge, a product judge), two in each of three fix cycles (a
  dedicated security delta re-review and a combined correctness/parsimony/product delta
  re-review), and one **final-candidate all-bars judge** that answered all four bars
  together in a single read over the merge candidate. No judge authored the diff.
- Degraded level: **none**.

## Panel manifest

```
panel: full — correctness ✓ (fresh-context judge, data/REST surface) · correctness ✓
(fresh-context judge, UI/test surface) · parsimony ✓ (fresh-context judge) · product ✓
(fresh-context judge) · security ✓ (dedicated fresh-context security judge) ·
deltas: six independent fresh-context delta re-reviews ✓ ·
final-candidate combined judge ✓ (all four bars in one read) ·
base 2b053d351385e5100f69494247d8aa42fe8a84be · reviewed candidate
8ec23c435b742d1404276497cdea768322f6f6a9 · merge candidate: the commit carrying this
record
```

The merge candidate differs from the reviewed candidate `8ec23c4` only by three
Markdown files: the two review records under `docs/reviews/` — this file and
`docs/reviews/P00-G18_OCR_DELEGATION.md` — and the superseding note in
`docs/qualification/DEV_READINESS_2026-10-17.md`, which the final-candidate judge
required. All three are excluded from Alibaba OCR's reviewable set and none is indexed
by Graft, so the reviewable set, the resolved rule groups and every mechanical number
quoted in this record are the same for the merge candidate as for the reviewed
candidate. Every one of those three changes is either this record's own evidence or a
direct consequence of a finding the final-candidate judge made.

One further note on the history: the commit that carries the round-3 code fixes is
titled `docs(reviews): record the P00-G18 panel and OCR delegation evidence`, which
understates it — that commit also carries the account page's guard fix, the new UI
contract test and the acceptance-matrix repair. The commit body discloses all three.
The branch history was not rewritten, because rewriting it would need a force-push,
which the repository's ruleset forbids.

## Installed upstream skill files

Installed outside the worktree from the pinned upstream commit, never edited, never
vendored into the repository (decision §3.3):

```
fcc6fa58368050275d40b161aa27bae36d58e97fa11d6c6b47a42587425798b2  ps-adr/SKILL.md
b49022f57c769b6b17ab0f98276447a47cedcfb5aa4c17b0becb868920206888  ps-build/SKILL.md
199627b169dd1ebc0150f32bb94bc007dbb429e2cb121515faff3e4e67459f9a  ps-checkpoint/SKILL.md
caa43b62557fd7c28793b909f498986325fd14f5ed7cd927314f269da66954df  ps-close/SKILL.md
452de81265b01470c4227001cd0e537fd373db2bfa22ea595232bf4b28ec7997  ps-doctor/SKILL.md
800b8b4b45ce76549147f13083bc98ec49c4ce393a07b9112345ec88d38c5041  ps-dormammu/SKILL.md
5cb1770afc872d8ed131de9d2460149173ab6805b698bca221050696cdc7a2f3  ps-init/SKILL.md
0b90ed23ecdfd6c8f031b5462c6e69e7ba3fd06a5b4893d7f71ce9135e48feee  ps-resume/SKILL.md
b4d0737cb3cf244a843dbca14cfa4b0b9fdc9449a34761f13d863f95eaaa02e9  ps-review/SKILL.md
0270481729536893b5291e6e29a2ee708fe1d4279c916b4da61ad1297d1341f7  ps-spec/SKILL.md
49aad41eb0a7dccbb8f6b21a642bddb22cec8412fd933cab27aa0fd5fcb966a0  ps-start/SKILL.md
```

## Findings and disposition — first round

Thirteen must-fix findings came out of five judges. Every one is fixed in
`a86565f`.

### Correctness, data and REST surface — one must-fix

- **MUST-FIX — the revoke transactions sat outside any try/catch, so a database failure
  rejected out of the route.** The callers received a bare 500 with no envelope, no
  `request_id` and no error code, outside the canonical contract that every sibling route
  in the same file follows. The judge verified it by injecting a throwing transaction.
  **Fixed**: both revoke routes now answer a canonical `INTERNAL_OPAQUE` failure envelope,
  and a runtime test asserts the status, the error code and the presence of a request id
  for all three new routes.
- **WORTH — DELETE was not idempotent at the HTTP layer.** Revoking a session that was
  already revoked answered 404, so a retry after a timeout read as "not found".
  **Fixed**: the update now keeps the first revocation time with
  `coalesce(revoked_at, now())` and answers 200. The security delta re-review verified on
  **real PostgreSQL 17** that two concurrent revokes keep the first timestamp, because
  READ COMMITTED re-evaluation re-reads the committed row.
- **WORTH — the list route mapped a list-query failure to 401**, which would sign the
  browser out over a transient database error. **Fixed**: the catch is scoped, and an
  invalid credential (`AuthError`) is distinguished from a database failure (anything
  else). The security delta re-review confirmed every `AuthError` thrown inside
  `validateSession` is a credential-validity check, so no database error can be swallowed
  into a 401.
- **WORTH — the bulk revoke counted expired sessions as locked-out browsers**, so the
  notice overstated how many were. **Fixed**: the predicate now counts only live ones.
  An expired session stays visible in the list as "Expired".
- **WORTH — `revokeOtherAccountSessions` had no invalid-identifier guard** on the keeper id,
  unlike its sibling. **Fixed**, and the keeper id is now required: the branch that
  revoked every session including the caller's had no production caller.

### Correctness, UI and test surface — five must-fix

- **MUST-FIX — every row's action button was named only "Revoke".** A screen reader heard
  N identical buttons and could not tell which session each acted on. **Fixed**: each
  button carries `aria-label={`Revoke session ${session.id}`}`, which keeps the visible
  "Revoke" as a prefix, so WCAG 2.5.3 still holds.
- **MUST-FIX — the Revoke button was disabled the moment it was clicked, destroying
  keyboard focus.** A disabled focused element is blurred to the body, so a keyboard user
  lost their place in the table. **Fixed**: the unavailable state is announced with
  `aria-disabled` and guarded in the handler, so the button stays focusable. This
  deliberately diverges from the `disabled` attribute used elsewhere in the application;
  the divergence is the fix, and the stylesheet carries a matching rule.
- **MUST-FIX — the page's "Sign out of all other sessions" button was never exercised by
  any test.** The smoke called the endpoint directly, and the only guard matched the
  label text, so deleting the handler would still have passed. **Fixed**: the browser
  journey now clicks the button and asserts the notice, the revoked session and the
  caller's own survival.
- **MUST-FIX — `describe()` was completely untested.** No assertion anywhere checked the
  State column, so a regression labelling every row "Signed in" would have shipped green.
  **Fixed**: the journey now reads the rendered state of a revoked row and of a live row.
- **MUST-FIX — a 404 or a 401 from the revoke actions surfaced the raw agent code and
  left a stale table.** **Fixed**: a 401 means signed out, and a 404 means "no longer
  listed", which is what the user asked for.
- **WORTH — the response body was parsed before the `response.ok` check**, so a non-JSON
  error body reported "could not reach the server" for exactly the case the HTTP-status
  message was written for. **Fixed**: the parse is guarded.
- **WORTH — the mount effect had no abort or cleanup**, unlike the sibling
  `session-access-banner.tsx`. **Fixed** with the same `AbortController` pattern.
- **WORTH — the busy flag was not reference-counted.** The panel confirmed this is
  harmless: the flag is set synchronously before the first `await`, so it serialises every
  user-initiated action and the buttons cannot overlap. **SKIP**, recorded as a known
  limitation rather than paid for with a counter.

### Parsimony — four must-fix

- **MUST-FIX — the page had a dead `"loading"` state.** Nothing ever set it, so the
  "Loading sessions…" paragraph could never render. **Fixed**: removed.
- **MUST-FIX — three hand-rolled copies of the request and failure handling.** The
  repository already has the helper, in `apps/web/app/boards/page.tsx` and
  `apps/web/app/flows/page.tsx`. **Fixed**: the page now uses one `callJson`.
- **MUST-FIX — `revokeOtherAccountSessions`'s optional keeper branch was
  production-unreachable** and contradicted its own doc comment. **Fixed**: the parameter
  is required and the branch is gone.
- **MUST-FIX — three source-text tests duplicated runtime coverage**, and behind them
  sat two real gaps: a bad-origin refusal on `revokeOtherSessionsRoute` and a
  byte-identical comparison of a foreign against an unknown id. **Fixed**: the
  source-text versions are replaced by runtime coverage that closes both gaps.
- **WORTH** — a no-op cast, a redundant re-test, a duplicated origin-and-validate block in
  the two revoke routes, an unused clock seam, a guard that could not change the outcome,
  a re-implemented invariant, four identical fixture checks and four token files. **All
  fixed**: the seam now has the boundary test it exists for, the guard is gone (verified
  empirically: `""`, `"not-a-uuid"`, a well-formed unknown UUID and
  `"'; drop table sessions; --"` all return `false` without throwing), the invariant is
  shared with the other views, and the fixture is one file and one loop.

### Product — three must-fix

- **MUST-FIX — the banner's link was labelled "Account" but pointed at `/login`**, so the
  page this grain ships had no entry point from the banner that renders on every data
  surface, including on the account page itself. **Fixed**: the link now points at
  `/account` when the visitor is signed in.
- **MUST-FIX — the readiness record still called the session list/revoke-all UI
  deferred**, which this grain makes false. **Fixed**: the item moved from deferred to
  delivered, and the queued-follow-up list no longer names it.
- **MUST-FIX — the acceptance matrix had no Post-Audit Delta entry** for this grain,
  against the repository's own append-only convention. **Fixed**: an entry was appended.
  The "Review-stack migration" bullet above it is preserved byte-for-byte.
- **WORTH — the supported-surface list omitted the account surface.** **Fixed**.
- **WORTH — the sessions table stores no device label, so a user who suspects a leaked
  token cannot tell which row to revoke.** **SKIP**, with the reason recorded: a device
  label and a last-seen value require a migration to the frozen `004_auth` sessions table
  and would store user-agent data the privacy surface has not been assessed for. The
  grain's capability — list and revoke — is complete without it, and the timestamps are
  the distinguishing signal the table has today.
- **WORTH — the surface is REST-only, with no MCP verb.** **SKIP**, and the precedent is
  decisive: the whole `/api/v1/auth/*` family exposes no MCP verbs, and the MCP inventory
  of 30 is contractually fixed in three test assertions and two qualification documents.
  An agent-facing verb needs a contract amendment first.

## Findings and disposition — fix cycle

Two independent fresh-context delta re-reviews over `36d1113..a86565f`, covering only the
changed findings.

### Security delta re-review — zero must-fix, no new hole

- All three accepted security findings are **FIXED**: the token-leak assertion now covers
  every token the fixture mints (and the reviewer confirmed it is non-vacuous, because
  the captured output accumulates the raw chunk before redaction); the invalid-identifier
  guard is in place and the keeper id is required (verified on real PostgreSQL 17 and on
  PGlite: `"not-a-uuid"`, `undefined` and `null` all revoke nothing and throw nothing);
  the stray blank line is gone.
- The reviewer re-derived the changed revocation semantics from first principles: the
  `user_id` filter is present on every path, a foreign id and an invented id stay
  byte-identical, the first revocation timestamp survives two concurrent revokes, the
  keeper exclusion is unaffected by the new expiry predicate, and the keeper is always
  server-derived.
- The reviewer confirmed that the shared `currentSession()` helper applies exactly the
  `signoutRoute` origin rule to both routes, that Bearer callers are still exempt, and
  that no database error can be swallowed into a 401.
- Two **SKIP** items, both recorded as known limitations: the swallowed invalid-identifier
  error poisons the enclosing transaction, which is harmless today because every
  transaction body is exactly one call, but is a footgun for a future caller; and the
  pre-existing `sessionStatusRoute` still maps every error to 401. Both are out of this
  grain's diff, and the second is fail-closed.

### Combined correctness, parsimony and product delta re-review

- **Correctness: PASS.** The judge verified every correctness finding as FIXED against
  the running code and the test suites: the revoke transactions are inside try/catch,
  `coalesce` makes DELETE idempotent while a foreign id still answers an identical 404
  (verified empirically on PGlite, which is real PostgreSQL: a swallowed 22P02 inside a
  transaction makes the COMMIT roll back and still resolve, so the malformed-id path
  yields 404 in production too), the list-query failure answers 500 rather than 401, the
  invalid-identifier guard is in place, the double-revoke and expiry-boundary tests are
  real, the row button's accessible name contains the visible label, the 401 and 404
  paths are handled, the JSON parse is guarded, the mount effect aborts, the bulk count
  is accurate, and the clock seam is exercised. The judge also confirmed that the
  `callJson` success path is byte-for-byte the same user-visible behaviour as before,
  and that Playwright honours `aria-disabled`, so the smoke's bulk click waits for the
  in-flight load and then clicks an enabled button rather than being flaky.
- **Parsimony: PASS.** All four findings fixed.
- **Product: FAIL, one must-fix** — the acceptance matrix had been corrupted by the
  author's own earlier edit, which anchored on a display-truncated line and spliced the
  new bullet into the middle of the existing "Review-stack migration" bullet. The
  orphaned tail made a false claim about PR #168 and contradicted the same file's own
  rule that historical entries are preserved. **Fixed**: the original bullet is restored
  byte-for-byte, verified by diffing it against `origin/main`, and the PR #168 entry
  follows it as its own bullet.

The judge also raised three new findings against the fix commit, all of which are fixed
in the commit that carries this record:

- **MUST-FIX — the acceptance-matrix corruption described above.**
- **WORTH — the bulk button's guard did not match its own `aria-disabled`.** The button
  announced itself unavailable when the page was not ready, but the handler only
  guarded on `busy`, so a control that was announced unavailable could still fire.
  **Fixed**: the guard now names the same condition as the announcement, and a test
  asserts that the two agree — the first version of that test was itself proved by a
  mutation control.
- **WORTH — a list that could not be loaded left a stale table on screen next to the
  error.** The `callJson` refactor had dropped the base behaviour of putting the page
  in the unavailable state. **Fixed**: the refused-list path sets it again, and a test
  guards it.

Three further items the judge raised were **SKIP** and are recorded as known
limitations: a revoke in flight at unmount is not aborted (only the mount load is);
the memoised `load` closes over a `callJson` that is recreated each render, which is
safe today because `callJson` reads nothing but stable setters — and is now fixed
anyway by memoising `callJson` itself, so the chain is sound rather than merely safe;
and the mount load cannot overlap a user-triggered load, because the busy flag is set
synchronously before the first `await` and every control is unavailable while it is
set.

Two further observations were verified and needed no action: the shared
`currentSession()` helper applies the origin rule once, for both routes, and
`validateSession` throws `AuthError` for every invalid credential and lets a database
error through, so the two are distinguishable.

### Second fix cycle — the delta over `a86565f..a84ceb4`

Two independent fresh-context delta re-reviews over `a86565f..a84ceb4`, covering the
code fixes, the acceptance-matrix repair, the new UI contract test and the two review
records.

#### Security delta re-review — one must-fix, in this record

- **MUST-FIX — this record claimed the merge candidate differed from the reviewed
  candidate only by the two Markdown records, which was verifiably false.** The commit
  that carries the record also carries the account page's guard fix, the new UI
  contract test and the acceptance-matrix repair. The record therefore claimed panel
  coverage and mechanical evidence over merge-candidate production code that had been
  fixed in that same commit. The repository's own `P00-G17` record shows this exact
  defect class is treated as must-fix. **Fixed**: the claim is replaced with the
  accurate enumeration, and the record now says that the code, test and matrix fixes
  in that commit are covered by the round-3 delta re-reviews rather than by the
  mechanical evidence, which is quoted against the two named reviewed candidates.
- **WORTH — the record said "Six mutation controls" while the table listed seven.**
  **Fixed**: it now says seven, that six make the smoke fail and the seventh makes the
  new UI contract test fail.
- The judge verified that the server side is byte-identical to the round-2 candidate,
  that the announcement and the guard name the same condition on all three controls,
  that no synthetic click reaches either revoke action for a control that announces
  itself unavailable, that the 404 path writes only a static notice, that the
  memoisation is sound, that the refused-list path now clears the stale table, that the
  new UI contract test is non-vacuous, and that the acceptance matrix is now one
  added line against `origin/main` with the historical bullet identical. The judge also
  reproduced every number quoted in the OCR record from a live preview run.
- The judge noted that the commit that carries the round-3 code fixes has a subject
  prefix that understates it. The history was not rewritten, because that would need a
  force-push, which the ruleset forbids; the discrepancy is disclosed above and in the
  commit body.

#### Combined correctness, parsimony and product delta re-review — one must-fix

- **Correctness: PASS. Parsimony: PASS. Product: FAIL on one must-fix**, which was the
  same acceptance-matrix corruption the security judge had already found, plus two
  worth-considering findings against the two records and one real must-fix in the
  account page, found in the working tree and fixed before this record was committed.

- **MUST-FIX — the catch branch of the account page's request helper set the failure
  banner but never reached the unavailable transition.** A refresh that failed at
  transport level — offline, DNS failure, a reset connection — therefore left the old
  session table on screen next to the error, which is the exact defect the second round
  had raised for the HTTP-refusal path. The base page had transitioned in that branch
  too, so the restoration had been partial. **Fixed**: the catch branch reaches the same
  transition as a refusal, with no HTTP status to report, and the UI contract test now
  asserts both paths. The test was proved by a mutation control that removes the call
  from the catch branch.

- **WORTH — the OCR record claimed the two files that changed between the candidates
  had been re-reviewed at their final content, when its delegated-review section
  described the earlier candidate.** **Fixed**: the delegated review now re-reviews
  both files at their final content against the same resolved rule group.
- **WORTH — the OCR record described the acceptance matrix as carrying "no delta
  entry", when the defect at that candidate was a *corrupted* entry, which the delegated
  review never reported.** **Fixed**: each candidate's matrix state is now described as
  it actually was, and the record says the corruption was found by the round-2 product
  judge.
- **WORTH — the matrix's PR #168 bullet pointed at a CI run identifier that no document
  holds.** **Fixed**: the pointer now names only the pull request body, where the run
  identifiers actually are.
- The judge verified that the matrix repair is exact (the historical bullet is
  md5-identical to `origin/main`'s), that all three controls pair their announcement
  with an identical guard, that the `callJson` restructure preserves the success path
  byte-for-byte, that the 404 path shows only the notice because the failure clearing
  lands in the same React batch, that the list route can only answer 200/401/429/500 so
  the load path never sees a 404, and that the new UI contract test is non-vacuous —
  proved by three scratch mutations, each of which fails exactly that test.

Three further items were **SKIP**: the `useCallback` on `callJson` is behaviourally
inert for the effect and only removes the stale-closure concern; a failed manual
refresh discards a still-valid table, which is the restored base behaviour; and the
`graft build` node count on the merge candidate was not reproduced by this judge
because `graft build` writes into the tree.

### Third fix cycle — the delta over `a84ceb4..8ec23c4`

Two independent fresh-context delta re-reviews over `a84ceb4..c5dc98c` and
`c5dc98c..8ec23c4`.

#### Security delta re-review — no code must-fix, two findings

The judge confirmed that the server side is byte-identical to the round-3 candidate,
that the `undefined` sentinel is type-level distinct from every HTTP status, that the
revoke action's hook cannot take its 404 branch on a transport failure, that the load
action's hook clears the stale table on both the refusal and the transport-failure
paths, that the abort guard still suppresses every state write on unmount, and that no
token, token hash, foreign session id or raw error is reachable from a failure message.
**No new hole in the code.**

The judge then found that this record and the OCR record still named `a84ceb4` as the
shipping state, which `c5dc98c` had overtaken — the same record-accuracy defect class
the record itself had already fixed once, against the repository's own `P00-G17`
precedent. **Fixed**: this record now names `8ec23c4` as the reviewed candidate, the
merge candidate is described as differing from it only by Markdown — at that point the two
review records, and since the readiness scorecard's superseding note as well — and
every mechanical number is scoped to the candidate it was measured on.

The judge also found a real gap in the new UI contract test: it asserted that the catch
branch *reached* the failure hook but not what it was called with, so changing
`onFailed(undefined)` to `onFailed(404)` kept every test green — and would have made a
request that never completed take the revoke action's 404 branch, clearing the failure
banner and showing the false "That session is no longer listed" notice. **Fixed**: the
test now requires the catch branch to call the hook with no HTTP status, and a mutation
control that changes the call to `onFailed(404)` makes the test fail.

#### Combined correctness, parsimony and product delta re-review — zero code must-fix

The judge confirmed that the catch branch now reaches the unavailable transition, that
the base behaviour at `36d1113` is restored completely, that the new assertion is a
real guard, that the OCR record's and this record's claims are now true, and that the
matrix's historical bullet is still byte-for-byte identical to `origin/main`'s. It
re-verified the numbers at the candidate it reviewed, and confirmed the Graft figures
from the tree's own graph artifact, including that the account page's `callJson` is
absent from the graph's function nodes while the five sibling pages' remain.

It raised one worth-considering finding against the OCR record's description of the
matrix at `a86565f`: the record said the historical bullet "was intact but the new PR
#168 entry had been spliced into the middle of it", which is self-contradictory — the
splice split the bullet in two. **Fixed**: the record now says the bullet was split in
two by the splice.

### Closing confirmation review

One further independent fresh-context judge read the delta from the reviewed candidate
to the merge candidate — three Markdown files, none of them production code — and
answered all four bars. It confirmed that both of the final-candidate judge's must-fix
findings were genuinely closed: that every row of the mutation-control table quotes a
message the current code actually produces, and that the all-bars judge is recorded
with its verdict, with the judge count and the manifest agreeing with each other. It
reproduced the OCR previews at all four quoted candidates, the three resolved rule
groups, the mechanical numbers, and the Graft figures from the tree's own graph
artifact, and confirmed that the matrix's historical bullet is byte-for-byte identical
to the base's and that no CI run identifier is claimed anywhere.

It raised one must-fix finding, an internal contradiction in this record — a sentence
in the third fix cycle's section still said the merge candidate differed "only by the
two Markdown records" while the manifest above it said three, because the manifest
was corrected when the readiness note joined the delta and the section below it was
not. **Fixed**. It also raised three worth-considering findings: a heading that
claimed a count its body did not substantiate, two sections both titled "the last fix
cycle", and a phrase that named two candidates where three had been reviewed. **All
fixed**.

### Final-candidate all-bars judge

One further independent fresh-context judge read the merge candidate and answered
**all four bars in a single read**, as decision §3.3.1 requires: "CORRECTNESS BAR: PASS ·
PARSIMONY BAR: PASS · PRODUCT BAR: PASS · SECURITY BAR: PASS". It reproduced the
merge candidate's own claims rather than taking them on trust: the merge delta is
Markdown-only, the diff shape is 20 files / 2482 insertions / 14 deletions, all
fourteen per-file figures match `git diff --numstat`, the OCR preview reproduces from a
live run at `8ec23c4`, every excluded file's exclude reason is exact, the three resolved
rule groups reproduce, the Node, Python, database, lint, typecheck, hygiene and validator
numbers reproduce, and the Graft figures are exact from the tree's own graph artifact.
It confirmed the matrix's historical bullet is byte-for-byte identical to the base's, that
no CI run identifier is claimed anywhere, that the force-push prohibition the record cites
is real, and that every security property holds on the shipped code.

It raised two must-fix findings, both in this record and both now fixed:

- **MUST-FIX — the mutation-control table quoted a message against an assertion that no
  longer existed.** The first row quoted `SMOKE_FAIL exactly one other session must be
  revoked, saw 1`, which is the message from `efabf73`; that assertion was replaced at
  `a86565f` and the bulk-revoke count at the reviewed candidate is `revoked === 0`.
  **Fixed**: every control was re-run against the reviewed candidate, and the table now
  carries the messages that candidate produces.
- **MUST-FIX — the panel recorded no all-bars combined judge.** The rounds split the
  bars, and the split panel runs *in addition to* the combined one under decision §3.2
  rather than instead of it. **Fixed**: the final-candidate judge is recorded as the
  all-bars judge, its four-bar verdict is quoted, and the judge count and the manifest
  name it.

It also raised a worth-considering finding against a readiness document, now fixed, and
one optional note against the frozen v1 Local release decision record, which is skipped
and recorded below.

#### Coverage of the commits between the base and the reviewed candidate

| Commit | Contents | Round that covered it |
| --- | --- | --- |
| `efabf73` | the feature | first round |
| `a3bc2af` | the account page driven in a real browser | first round |
| `36d1113` | inline styles → design system; the vacuous smoke check made real | first round |
| `a86565f` | the thirteen round-1 must-fix findings | first and second fix cycles |
| `a84ceb4` | the round-2 findings, plus the two review records | second fix cycle |
| `c5dc98c` | the catch-branch transition, plus the record corrections | third fix cycle |
| `8ec23c4` | the UI contract test requires no HTTP status | third fix cycle |

## The panel proved the new assertions are not vacuous

Nine mutation controls were run against the product in scratch copies. Six make the
smoke fail where it previously passed; three make the new UI contract test fail. Every
one of them was **re-run against the reviewed candidate `8ec23c4`**, and the messages
below are the ones that candidate produces:

| Control | Result |
| --- | --- |
| the bulk-revoke count assertion changed from 0 to 99 | `SMOKE_FAIL nothing is left to revoke, saw 0` |
| the rendered-row count assertion changed from 3 to 9 | `SMOKE_FAIL the account page must render three sessions, saw 3` |
| the account page's failure banner rendered unconditionally | `SMOKE_FAIL revoking a session from the account page must not report an error: ["CONTROL: control error"]` |
| the notice text changed to "Signed out 9 other session(s)." | `SMOKE_FAIL smoke error: page.waitForFunction: Timeout 20000ms exceeded.` |
| the State-column assertion changed to a word the page never renders | `SMOKE_FAIL the revoked row must say Revoked, saw "…Revoked…"` |
| the captured server output made to carry a session token | `SMOKE_FAIL the web server output must not contain a session token` |
| the bulk button's guard no longer matched its `aria-disabled` | `✖ a control that is announced as unavailable never acts` |
| the catch branch stopped calling the failure hook | `✖ a control that is announced as unavailable never acts` |
| the catch branch called the failure hook with `404` instead of no status | `✖ a control that is announced as unavailable never acts` |

Two of these needed a second run before the table could say what it now says. The
sixth control was described in this record before it had actually been run; it was then
run, and it fires with exactly the message quoted. And the first control's message
changed with the code: the bulk-revoke assertion was `revoked === 1` when it was first
run and is `revoked === 0` at the reviewed candidate, because the browser journey now
drives the bulk revoke from the page and the endpoint is then called again to show it
is idempotent. The final-candidate judge caught that the table was quoting a message
against an assertion that no longer existed, and every control was re-run so that each
row describes the shipped code.

The first control also caught a vacuous assertion of the author's own: the smoke's error
check looked for `p[role=alert]`, but the account page renders a `div`, so it could never
fire. Scoping it to `main [role=alert]` excludes the always-present, empty route
announcer Next.js renders outside the page content, and the control proves it fires.

## Mechanical evidence

Graft 0.21.1, on the **reviewed candidate `8ec23c4`**:

- `graft build --no-gitignore --no-ignore .` — exit 0; 2621 nodes (1437 function, 430
  method, 312 file, 280 interface, 87 class, 75 type), 7605 edges, 312 cards.
- `graft check .` — "graph check: OK — the wiring graph is in sync with the code".
- `graft blast --base origin/main --format markdown` — "5 areas changed → 1 area can be
  affected. 1 dependent symbol, depth 2".

The node count is one lower than the first candidate's 2622 because `callJson` became a
`useCallback` binding rather than a function declaration, and is no longer counted as
its own symbol; the round-3 judge confirmed that the account page's `callJson` is
absent from the graph's function nodes while the five sibling pages' remain.

Graft coverage limitation, stated explicitly: the per-area test signal reports 2 areas
reached and 3 not reached. `internalOpaque` and `listAccountSessions` are reached by
their new runtime tests. `SessionAccessBanner`, the account page's `asRecord` and the
smoke's `prepareDatabase` are reported as unreached because this repository's UI tests
are source-text assertions and Graft's static model does not treat the browser journey
as a test path into the page module. The account page is nevertheless exercised at
runtime by a real Chromium browser, and the banner by source-text assertions. This is a
statement about Graft's reachability analysis, not about the coverage itself.

The mechanical suites on the **reviewed candidate `8ec23c4`**: 288/288 Python; 240/240
Node across `tests/node/`, `apps/web/tests/` and `apps/worker/tests/`; 156 pass and 15
pre-existing skips across `packages/db/tests/` (the five `pg-*.test.mjs` files, which
skip without a real PostgreSQL); `eslint` clean; `tsc --noEmit` clean; the production
build clean; `scripts/smoke-auth-journey.mjs` exit 0 with no disposable directory left
behind; `scripts/ci_hygiene.py` clean at 1069 tracked files;
`scripts/validate_upstreams.py` and `scripts/validate_agent_contract.py` pass.

## Known limitations accepted by the panel

Each of these was raised by a judge, and none of them is a hole; each is recorded here
rather than paid for in this grain.

- **The session list is not paginated.** The list is the caller's own sessions, and
  their number is bounded by the account's own successful sign-ins, not by an
  attacker. The pre-existing `listWorkspacesForUser` on the same authentication
  surface — returned by `sessionStatusRoute` to every authenticated caller — is
  unbounded in the same way, while the research lists (`gallery`, `changes`) use the
  repository's `DEFAULT_LIMIT 20 / MAX_LIMIT 50` convention. Pagination is a
  repository-wide API-contract decision, and the pre-existing authentication surface
  sets its own precedent.
- **A session carries no device label.** The `sessions` table stores no device,
  user-agent, IP or last-seen value, so a user who suspects a leaked token tells
  sessions apart by their timestamps. A device label would require a migration to
  the frozen `004_auth` sessions table and would store user-agent data the privacy
  surface has not been assessed for. The grain's capability — list and revoke — is
  complete without it.
- **There is no MCP verb for sessions.** The whole `/api/v1/auth/*` family exposes no
  MCP verbs, and the MCP inventory of 30 is contractually fixed in three test
  assertions and two qualification documents. An agent-facing verb needs a contract
  amendment first.
- **The swallowed invalid-identifier error poisons the enclosing transaction.** The
  transaction body is exactly one call today, so the observable result is correct,
  but a future caller of the exported helpers must not add a second statement after
  one of them.
- **`sessionStatusRoute` still maps every error to 401.** That is pre-existing,
  unchanged by this grain, and fail-closed, but it is the same inconsistency this
  grain removed from the three new routes. Changing it belongs to a separate change
  on the whoami contract.
- **Expired sessions are never purged.** The `sessions` table has never had a purge
  job, so its growth predates this grain; what this grain adds is that the account
  can now see those rows, marked "Expired".
- **The v1 Local release decision record is not extended.** The final-candidate judge
  noted that `docs/qualification/V1_LOCAL_RELEASE_DECISION.md` §5 still lists the
  supported features without the account surface, while the v1 Local acceptance
  contract now names it. **SKIP**, with the reason: that file is a dated decision
  record, explicitly not a publication, and a frozen record is evidence of what was
  decided then. The acceptance contract is the living document, and it is updated.

## Aligned review findings and the resolution rule

The correctness and product judges both asked for the same thing in two places, and both
were resolved by a narrower fix than the one proposed, with the reason recorded:

- The correctness judge proposed deleting the three source-text tests outright. The
  panel instead moved their coverage to runtime and closed the two runtime gaps they
  stood in for, so no assertion was lost.
- The product judge proposed that a 404 mean "already gone" and a 401 mean "signed out".
  Both are implemented, but the server-side 404 for an already-revoked session no longer
  happens at all: `coalesce` makes it a 200, which removes the case rather than papering
  over it.

Where judges conflicted — correctness wanted a tri-state from the revocation helper while
parsimony wanted one boolean — the spec and `PRODUCT.md` are the objective function and
parsimony wins ties: the helper keeps one boolean, and the idempotency the correctness
judge wanted is bought with a one-word SQL change rather than a tri-state.
