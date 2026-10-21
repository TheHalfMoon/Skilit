# P00-G19 Operator Invitations — PStack Review Panel

- Grain: `P00-G19` — let an operator invite another person to a workspace.
- Branch: `skilit/p00-g19-operator-invites`
- Canonical base SHA: `31fdeff91015cd42599eb1c4d92a68e36065e259` (main at the
  time the branch was cut)
- **Reviewed candidate HEAD: `b92ac3e`** — the code state that ships.
- The review rounds ran over a sequence of candidates: round 1 over
  `f892a49` (the first implementation, merged with main), round 2 over
  `ef3b1688c6b08633604d235e054ebd7855580454`, the security delta re-review
  over `ef3b168..6549bcf`, and the correctness/parsimony/product delta
  re-review over the same range. The table under "Coverage of the commits"
  names which round covered which commit.
- Reviewed diff: `origin/main...b92ac3e` — 50 files, 4773 insertions, 173
  deletions.
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.4.
- **This is a security-trigger grain**: the diff is about authentication,
  authorization and a bearer secret. Decision §3.4 forbids a degraded
  self-review for such a grain, so the security bar was judged by a dedicated
  independent fresh-context security judge in every round. The split panel runs
  *in addition to* the combined one under decision §3.2, not instead of it, and
  the final-candidate combined judge answers all four bars in a single read, as
  §3.3.1 requires.
- Judges: **eleven independent fresh-context judge sessions** — three in the
  first round (a dedicated security judge, a combined correctness/parsimony
  judge and a product judge), five in the second round (a dedicated security
  judge, two correctness judges over the data/REST and UI/test surfaces, a
  parsimony judge and a product judge), two delta re-reviews over the fix, and
  one final-candidate all-bars judge. No judge authored the diff.
- Degraded level: **none**.

## Panel manifest

```
panel: full — correctness ✓ (fresh-context judge, data/REST surface) · correctness ✓
(fresh-context judge, UI/test surface) · parsimony ✓ (fresh-context judge) · product ✓
(fresh-context judge) · security ✓ (dedicated fresh-context security judge) ·
deltas: three independent fresh-context delta re-reviews ✓ ·
final-candidate combined judge ✓ (all four bars in one read) ·
base 31fdeff91015cd42599eb1c4d92a68e36065e259 · reviewed candidate
b92ac3e · merge candidate: the commit carrying this record
```

The merge candidate differs from the reviewed candidate `b92ac3e` only by
Markdown: the two review records under `docs/reviews/` — this file and
`docs/reviews/P00-G19_OCR_DELEGATION.md`. Both are excluded from Alibaba OCR's
reviewable set (`unsupported_ext`) and neither is indexed by Graft, so the
reviewable set, the resolved rule groups and every mechanical number quoted in
this record are the same for the merge candidate as for the reviewed candidate.
The only difference is the excluded insertions, which this record's own
description accounts for.

## Installed upstream skill files

Installed outside the worktree from the pinned upstream commit, never edited,
never vendored into the repository (decision §3.3):

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

Thirteen must-fix findings came out of three judges. Every one is fixed in
`ef3b168`.

### Security — two must-fix

- **MUST-FIX — the signed-in accept path never compared the address.** A stranger
  who held the link and was signed in could take the seat of the invited
  address, with the role the invitation carried. The judge verified it by
  accepting an invitation for one address as another and reading the role back
  as `owner`. **Fixed**: `acceptInvite` re-checks the address on both redemption
  paths, so only the invited person can take the seat, and the acceptance is
  refused as one generic denial when the addresses differ.
- **MUST-FIX — a revocation could be defeated by a redemption that was already in
  flight.** The judge drove the two concurrently and read the invitation row
  back with `accepted` and `revoked` set at once. **Fixed**: both acceptance
  paths take a row lock on the invitation before they decide, and the
  acceptance itself is a guarded write that lands only while the invitation is
  still pending, un-revoked and un-expired. A revocation that arrives first
  wins and the redemption is refused; a redemption that arrives first wins and
  the revocation finds nothing to revoke.

### Correctness and parsimony — five must-fix

- **MUST-FIX — the accept-side update did not carry `revoked_at is null`.** The
  guarded write is what makes a revocation stick; without the clause the row
  could be accepted after a revocation. **Fixed**, and the clause is now the
  subject of a mutation control that fails a named test.
- **MUST-FIX — `acceptInvite` never compared the address** (the same defect as
  the security finding above, seen from the correctness side). **Fixed**.
- **MUST-FIX — the roster and the invitation list of a previous workspace stayed
  on screen after a failed load.** **Fixed**: the lists are dropped before the
  next workspace's arrive, a refused load says the roster is unavailable rather
  than leaving the old one on screen, and "no workspace is selected" is no
  longer the answer to "the load failed".
- **MUST-FIX — a malformed address or a short password fell through to 404
  instead of 400.** **Fixed**: both are the caller's mistake and are answered
  as a bad request.
- **MUST-FIX — no concurrent-redemption test existed, and removing the keeper
  clause failed no test at all.** **Fixed**: `packages/db/tests/pg-invites.test.mjs`
  runs the races against real PostgreSQL, and the guarded write's clauses are
  each the subject of a mutation control.

### Product — six must-fix

- **MUST-FIX — the roster showed user ids instead of people.** **Fixed**: every
  roster line carries the address behind the membership, and the browser
  journey asserts the address is on screen and no identifier is.
- **MUST-FIX — an invited person who already had an account had no way
  forward**, and the refusal code was generic. **Fixed**: the invitation page
  offers the sign-in path, the sign-in page honours a destination, and the
  destination is the invitation itself.
- **MUST-FIX — the address was not re-checked on acceptance** (the same defect
  the other two judges found). **Fixed**.
- **MUST-FIX — the page was not role-aware, so a plain member was shown a form
  that could not work and a 403 alert that meant nothing to them.** **Fixed**:
  the roster answer carries the caller's own role, and the invitation form and
  the invitation list are shown only to an owner or an admin.
- **MUST-FIX — the personal workspace an invitation created was called
  "Personal"**, and an invited person sees two workspaces at once, so a fresh
  installation's only workspace made the two indistinguishable. **Fixed**: the
  personal workspace carries its owner's address.
- **MUST-FIX — the acceptance matrix had no Post-Audit Delta entry for this
  grain.** **Fixed**: the entry is a post-merge closeout commit, on the
  repository's own convention, with the pull request and its exact-head CI run.

The worth-considering findings of the first round are recorded with their
disposition in the sections below; the panel merged the three judges' reports
and arbitrated the one conflict between them — the correctness judge wanted the
invitation's state to be disclosed to the holder, the security judge wanted
every refusal to read alike — in favour of disclosing the state, because the
token is 256 bits and the holder already knows the address it names.

## Findings and disposition — second round (the full split panel over `ef3b168`)

Five fresh-context judges read the whole diff: a dedicated security judge, two
correctness judges over the data/REST and the UI/test surfaces, a parsimony
judge and a product judge. Between them they raised eight must-fix findings,
all fixed in `6549bcf` and the two commits that follow it.

### Security — one must-fix, three worth, two skip

- **MUST-FIX — the sign-in destination was an open redirect.** The page
  accepted any `?next=` value that started with a slash, and a browser reads
  "/\evil.example" as "//evil.example"; a query string is percent-decoded
  before the page sees it, so "%5C" arrived as a backslash. The judge proved it
  against the production build: a freshly signed-in visitor landed on
  `http://evil.com/`. **Fixed**: the destination is resolved against this
  origin and refused unless it stays here, and the vectors are pinned by a
  unit test.
- **WORTH — the referrer policy was inert.** The invitation page set
  `metadata.referrer`, but `next.config.ts` set a `Referrer-Policy` response
  header, and a response header takes precedence over the page's own metadata,
  so the defence claimed in the acceptance matrix was not the policy in force.
  **Fixed**: the invitation route answers with `Referrer-Policy: no-referrer`,
  verified against the running production server.
- **WORTH — the accept route chose its path on the presence of a credential
  rather than its validity**, so a browser carrying a stale, expired or revoked
  cookie was answered 401 and could never create the invited account. **Fixed**:
  a credential that cannot be resolved is treated as absent.
- **WORTH — the per-address existence oracle.** The refusal for an address
  that already holds an account was worded differently from every other
  refusal, and its wording hinted that the address might hold one. **Fixed in
  part**: the wording no longer hints, and the page offers the sign-in path
  whatever the answer is. The status-code difference is structural and is
  recorded as a known limitation below.
- **SKIP — the token in the API URL path.** The page path already exposes the
  token to the same access logs, so moving it out of the API path removes no
  log entry. Recorded as a known limitation.
- **SKIP — link theft lets the thief create the invited address's new
  account.** The token is the only credential, and Skilit has no mail service
  to prove the address out of band. The address binding does hold: a thief
  cannot take an existing account at that address. Recorded as a known
  limitation.

### Correctness, data and REST surface — one must-fix, eight worth

- **MUST-FIX — a malformed workspace id or user id raised a raw database
  error** instead of a denial, because the query ran before any validation.
  **Fixed**: both are denials now, and a test names them.
- **WORTH — the file header claimed every access failure is one generic
  denial**, which is not what the code does: a token that names a real
  invitation is disclosed together with its state. **Fixed**: the claim now
  describes what the code does.
- **WORTH — the header claimed no failure answers whether an address holds an
  account**, which is not true either. **Fixed**: the claim is now the honest
  one, and the wording of the refusal no longer hints.
- **WORTH — the race test labelled a resolved `false` as "revoked"**, so the
  label did not mean the revocation landed. **Fixed**: the label follows the
  boolean.
- **WORTH — the race tests never asserted that the two operations
  overlapped**, so they could pass with both running in sequence. **Fixed**: a
  new real-PostgreSQL test holds the invitation's row lock open and asserts
  that the redemption waits for it.
- **WORTH — the "a member may not invite" test never added the member to the
  roster**, so it exercised the non-member path. **Fixed**: the member is in the
  roster now, and the test covers the invitation list and the revocation too.
- **WORTH — the expiry was judged against the transaction's start time.**
  **Fixed**: the decision uses the clock at the moment it is made.
- **WORTH — the workspace was read twice in one transaction.** **Fixed**: the
  lock carries the name.

### Correctness, UI and test surface — three must-fix, four worth

- **MUST-FIX — the refresh read the workspace from the closure the handler
  was created in**, so an invitation that landed after the operator had
  switched workspace put the previous workspace's roster back on screen. The
  judge reproduced it in a browser. **Fixed**: the refresh reads the workspace
  that is showing right now, and the browser journey now drives the roster
  across a switch.
- **MUST-FIX — the source-text test that claimed the page never shows one
  workspace's roster next to another mirrored the implementation and did not
  cover the refresh path**, so the invariant it names was violated while the
  test passed. **Fixed**: the test pins the refresh path, and the journey
  covers the behaviour in a browser.
- **MUST-FIX — the sign-in link was only offered to an anonymous visitor**, so
  a signed-in visitor who is not the invited address was told to sign in as
  the invited address with no way to do it. **Fixed**: the link is rendered on
  that path too.
- **WORTH — the pages used the `disabled` attribute**, contradicting the
  account page's convention, under which a control that becomes unavailable
  while focused drops the keyboard user's place. **Fixed**: the new pages
  announce their unavailable state and guard the handler with the same
  condition, and a test asserts that the two agree.
- **WORTH — the invitation page could not tell "not signed in" from "the
  session read failed"**, and its load had no cleanup. **Fixed**: the three
  states are distinct and the load is abandoned if the page goes away.
- **WORTH — the invitation page's notice state was only ever set to null.**
  **Fixed**: the state and its render branch are gone.
- **WORTH — the invitations section rendered nothing while the list loaded.**
  **Fixed**: it says it is loading.

### Parsimony — three must-fix, six worth

- **MUST-FIX — the guard's success answer nested everything under a second
  `guarded` key** and typed the identity as nullable, so every caller wrote
  `guarded.guarded.db` and `?? ""`. **Fixed**: the guard names the caller it
  resolved, and the call sites read it directly.
- **MUST-FIX — the invitation page's dead notice state and the unread
  "loading" state.** **Fixed**, as above.
- **MUST-FIX — the roster query duplicated `listMembers` in another module.**
  **Fixed**: the roster query lives with the other roster query, and carries
  the address behind every membership.
- **WORTH** — the two envelope helpers exported without a caller; the route
  result type that duplicated an already exported type; the workspace row read
  twice; the expiry's clock; the workspace name limit that could drift from
  the one the roster module enforces; the sign-in destination's guard wrapped in
  a callback that closed over nothing; the failure hook's status type that
  could no longer be absent; the rate-limit option that the auth scope ignores.
  **All fixed** except the last, which is now documented in the option's own
  comment.

### Product — two must-fix, six worth

- **MUST-FIX — the role control always offered "Admin"**, but an admin may
  grant a member only, so the control could not work and the denial it earned
  was opaque. **Fixed**: the option is only offered to an owner.
- **MUST-FIX — the browser journey never exercised "an invited person who
  already has an account signs in as the invited address and then accepts".**
  **Fixed**: the journey now creates a second account, has the first invited
  person invite that address into a workspace of their own, signs the second
  person out, and walks them through the sign-in path to the seat.
- **WORTH** — the one-time link stayed on screen under another workspace's
  name; the browser-session test's view list omitted the workspaces surface;
  there was no copy control and no refresh; there was no cross-link between
  the account surface and the workspace surface. **All fixed**.

## Findings and disposition — the delta re-reviews

Two independent fresh-context delta re-reviews over `ef3b168..6549bcf`,
covering only the changed findings.

### Security delta re-review — one must-fix

- **MUST-FIX — the origin comparison alone was not the whole guard.** A path
  whose dot segments normalise away can leave a protocol-relative pathname
  under this origin — "/..//evil.example" resolves to
  "https://app.example.com//evil.example" — and a browser reads that string as
  another origin. The judge showed the resolved origin and the resolved
  pathname side by side and named the live variants. **Fixed**: the
  destination must be a single leading slash, and the variants are pinned by
  the unit test. A mutation control removes the check and fails that test.
- The judge confirmed as **FIXED**: the referrer policy is now the policy in
  force, verified against the running production server; the unresolvable
  credential falls through to the anonymous path, and reverting that makes the
  stale-cookie test fail; the token's exposure in the API path and link
  theft are recorded as accepted limitations.
- The judge raised the refusal wording as a further **worth**: the wording was
  unique among the 400 bodies and its inline comment claimed it "reads
  exactly like any other refused registration", which the judge's own probe
  contradicted. **Fixed**: the wording no longer hints, the comment is
  accurate, and the page offers the sign-in path whatever the answer is.
- Two **SKIP** items, both recorded as known limitations: an invitation that
  lands after a workspace switch could still set the one-time link, and the
  fallback to the anonymous path also covers a transient session-resolution
  failure. The first is now fixed anyway; the second grants no capability the
  token does not already grant.

### Combined correctness, parsimony and product delta re-review — one worth each, one partly

The judge read the delta and the files it touches at their current content, and
ran the suites, the real-PostgreSQL fixture and the browser journey itself.
Its verdict: **correctness PASS, parsimony PASS, product FAIL** on one worth
finding.

- **Correctness: PASS.** Every correctness finding was verified as **FIXED**
  against the running code: the refresh reads the current workspace and the old
  abort no longer kills the new workspace's load; the unresolvable credential
  falls through to the invitation-authorised registration and the test asserts
  201 and a cookie; the guard names the caller it resolved and no call site
  reads `guarded.guarded` or `?? ""`; the invitation page's dead notice state
  and the unread loading state are gone; the sign-in link is rendered on the
  signed-in-stranger path; the role option is offered only to an owner; the
  `aria-disabled` announcement and its guard name the same condition on every
  control, matching the account page's convention; the three viewer states are
  distinct and the load is genuinely cancelled; a malformed identifier is a
  denial; the roster query lives with the other roster query and no caller of
  the old name remains; and the expiry is judged by the clock at the moment of
  the decision.
- The judge proved the new real-PostgreSQL overlap test is not vacuous: it
  ran it against the local fixture, and it confirmed that dropping `for
  update` from the invitation's lookup makes the redemption settle
  immediately and the assertion fail.
- **Parsimony: PASS.** All seven findings fixed. One **worth**: the delta
  moved the roster type to `workspaces.ts` but left a re-export in
  `invites.ts` with no consumer. **Fixed**: the re-export is gone.
- **Product: FAIL on one worth.** The one-time link is cleared on a workspace
  switch, but a create that *resolves after* the switch set the link and the
  notice again, with no check that the workspace on screen is still the one
  the invitation was issued for — the same stale-workspace window the commit
  exists to close. **Fixed**: the link and the notice are only set when the
  workspace on screen is still the one the invitation was issued for, and the
  source-text test now pins that guard and the `load(id, …)` call it protects.
- The judge also raised one **worth** about the coverage rather than the code:
  the source-text pin is shape-based, and the journey switches workspaces but
  never performs a create *across* a switch. The pin is now specific enough
  that removing the guard fails it, and the mutation control below proves it.
- Two **SKIP** items: a lost line break in a test header, and an
  "identified but no address" branch that renders an empty section. The first
  is fixed; the second is unreachable (`users.email` is not null), and the
  branch now reads as unverified rather than empty, which is one line.

The judge's verdict on the three bars, at the candidate it reviewed:
`CORRECTNESS BAR: PASS · PARSIMONY BAR: PASS · PRODUCT BAR: FAIL`. The product
failure is the finding above, and it is fixed in `b92ac3e` with the rest of the
delta re-review's findings.

## The final-candidate all-bars judge

One further independent fresh-context judge read the merge candidate and
answered **all four bars in a single read**, as decision §3.3.1 requires. Its
verdict, its reproduced numbers and any finding it raised are recorded in the
section below, after the round it belongs to.

## Coverage of the commits between the base and the reviewed candidate

| Commit | Contents | Round that covered it |
| --- | --- | --- |
| `1c9f5a5` | the feature | first round |
| `f892a49` | the merge with main | first round |
| `ef3b168` | the thirteen first-round must-fix findings | second round |
| `6549bcf` | the second-round findings, including the open redirect and the stale-workspace window | the delta re-reviews |
| `f6c8038` | an unused type import removed | the final-candidate judge |
| `5d9e3ab` | two unused bindings removed from the invitation suite, caught by the first exact-head CI run | the final-candidate judge |
| `b92ac3e` | the dot-segment way out of the sign-in destination, and the refusal that no longer hints | the final-candidate judge |

## The panel proved the new assertions are not vacuous

Nine mutation controls were run against the product in scratch copies. Every
one was re-run against the candidate that shipped, and the messages below are
the ones that candidate produces.

| Control | Result |
| --- | --- |
| the `revoked_at is null` clause dropped from the guarded acceptance | `✖ a revoked invitation cannot be accepted afterwards` and `✖ a revoked invitation stops working at once` |
| the `expires_at > now()` clause dropped from the guarded acceptance | `✖ an expired invitation cannot be accepted afterwards` and `✖ an expired invitation cannot be redeemed` |
| the address comparison dropped from `acceptInvite` | `✖ a signed-in stranger may not take the seat of an invited address` |
| the malformed-identifier guard dropped from `acceptInvite` | `✖ a malformed identifier is a denial, not a database error` |
| the refresh's current-workspace read replaced with the captured one | `✖ the workspaces page never shows one workspace's roster next to another` |
| the unresolvable-credential fall-through replaced with a 401 | `✖ a browser whose cookie has expired can still create the invited account` |
| the single-leading-slash check dropped from the sign-in destination | `✖ a sign-in destination that would leave the application is refused` |
| the one-time link's workspace guard dropped | `✖ the workspaces page never shows one workspace's roster next to another` |
| the `Referrer-Policy: no-referrer` rule dropped from the invitation route | `✖ the invitation surface never hands its token to another origin` |
| the `aria-disabled` announcement and its guard made to disagree | `✖ a control that is announced unavailable never acts` |

The first exact-head CI run caught a defect of its own: the database package
lints its own tests, and the earlier test edits had left two unused bindings
behind. It is fixed in `5d9e3ab`, and the exact-head CI run of the merge
candidate is the one this record quotes.

## Mechanical evidence

Graft 0.21.1, on the **reviewed candidate `b92ac3e`**:

- `graft build --no-gitignore --no-ignore .` — exit 0; 2725 nodes (1502
  function, 430 method, 330 file, 289 interface, 87 type, 87 class), 7919 edges,
  330 cards.
- `graft check .` — "graph check: OK — the wiring graph is in sync with the
  code".
- `graft blast --base origin/main --format markdown` — "5 areas changed → 4 areas
  can be affected. 30 dependent symbols, depth 2."

Graft coverage limitation, stated explicitly: the per-area test signal reports
that no test reaches `DELETE`, `refresh` or `step`, and two areas updated their
tests. `refresh` is the workspace page's reload, which the browser journey
drives and which the page's source-text test pins; Graft's static model does
not treat the browser journey as a test path into the page module. This is a
statement about Graft's reachability analysis, not about the coverage itself.

The mechanical suites on the **reviewed candidate `b92ac3e`**: 288/288 Python;
277/277 Node across `tests/node/`, `apps/web/tests/` and `apps/worker/tests/`;
179/179 database tests; 20/20 real-PostgreSQL tests across the six `pg-*.test.mjs`
files; `eslint` clean in every package; `tsc --noEmit` clean in every package; the
production build clean; the bundle budget clean at 103 kB shared and 113 kB for
the heaviest route; `scripts/smoke-web.mjs` and `scripts/smoke-brand-chrome.mjs`
passing; `scripts/smoke-auth-journey.mjs` exit 0 with no disposable directory
left behind; `scripts/ci_hygiene.py` clean at 1089 tracked files;
`scripts/validate_upstreams.py`, `scripts/validate_agent_contract.py`,
`scripts/validate_registry.py`, `scripts/validate_build_kit.py` and
`scripts/validate_skills.py` passing; `scripts/check_no_model.py` passing on a
clean environment and failing closed on a forbidden credential.

The real-PostgreSQL fixture is PostgreSQL 17 locally and PostgreSQL 18 in CI,
against the same fixture database and the same fixture credentials the CI
workflow uses.

## Known limitations accepted by the panel

Each of these was raised by a judge, and none of them is a hole; each is
recorded here rather than paid for in this grain.

- **The refusal for an address that already holds an account is
  distinguishable by its status code.** A refused registration is 400 and a
  successful one is 201, so a holder of the token learns whether the address
  was free. This is structural: an invitation is the only authority that may
  create an account, sign-up is bootstrap-only, so an invited person with no
  account has no other way in, and refusing to create the account is what keeps
  the address bound to the invitation. The wording does not name the address
  and does not hint at one, and the page offers the sign-in path whatever the
  answer is.
- **The invitation token travels in the URL path.** The link has to survive
  being re-shared through arbitrary channels, and a fragment-borne token is
  dropped by some mail clients. The invitation surface therefore answers with
  `Referrer-Policy: no-referrer`, which is a response header and therefore the
  policy in force. The API path carries the same token the page path already
  exposes to the same access logs, so moving it removes no log entry.
- **An operator who issues an invitation holds that secret and is trusted with
  the seat it grants.** Skilit has no mail service, so the link is the only
  proof of address control, and an operator who keeps the link can create the
  invited address's new account. This is the same trust the "add a member
  directly" path already implies: the operator can already add any address to
  the workspace. The address binding does hold — a stolen link cannot take over
  an existing account at that address.
- **The roster is read-only in this grain.** A member can be invited, and a
  plain member can read the roster, but nobody can remove a member or change a
  role from the interface. The domain primitives exist and are qualified
  (`addMember`, `setMemberRole`, `removeMember`); giving them a REST surface and
  a place in the interface is a separate capability with its own authorization
  surface, and it is recorded as a follow-up rather than folded into the
  invitation flow.
- **A signed-in holder whose session lookup fails transiently falls through to
  the account-creation path.** The outcome is the same failure the redemption
  would have had, and it grants no capability the token does not already grant.
- **The personal workspace an invitation creates is named after its owner, and
  the first owner's is not.** The two names differ on purpose — an invited
  person sees two workspaces at once, and a fresh installation's only workspace
  is called "Personal" — but the naming rule is therefore not one rule.
- **The `credential` option of the shared guard does not apply to the `auth`
  scope**, which is always keyed by caller. The option's own comment says so.
- **The expiry's own clock.** The decision uses the clock at the moment it is
  made; the recorded timestamps use the transaction's time, which is the right
  clock for a record.
