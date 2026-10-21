# Skilit v1 Local — Release Readiness Report

Status: **READINESS RECORD (not a publication, not a release decision).** The
release *decision* is the founder's and is recorded separately, in
`docs/qualification/V1_LOCAL_RELEASE_DECISION.md`, which is a dated decision
record and is deliberately not edited by later work. This record answers a
narrower question: **on the current candidate, is the engineering finished,
and what is still the owner's to record?**

- Candidate: the merge of PR #170 (the operator-invitation grain) — see
  "The candidate" below.
- Scope: v1 Local, the zero-founder-spend self-hosted core.
- Companion records: `docs/qualification/IMPLEMENTATION_COMPLETION.md` (is
  every grain implemented), `docs/qualification/AF-12_ACCEPTANCE_MATRIX.md`
  (is every row accepted), `docs/qualification/V1_LOCAL_ACCEPTANCE_CONTRACT.md`
  (what v1 Local contracts to support), and the per-grain review records under
  `docs/reviews/`.

## The candidate

- Merge candidate of the last grain: `c9fff0b` — the commit carrying the
  P00-G19 review records and the changes the final-candidate judge required.
- Exact-head CI of that candidate: run `39600314942`, fifteen of fifteen
  checks green.
- The tree ships no release, no tag, no deployment and no publication, and
  this record does not create one.

## Is the engineering finished?

Yes, for the v1 Local scope. Every grain in the plan's own implementation
sequence and every grain the AF-00 blueprint added is implemented and merged;
the matrix that lists them pull request by pull request is
`docs/qualification/IMPLEMENTATION_COMPLETION.md`. The remaining items are
either authorised deferrals with a recorded trigger, or owner gates, and the
two are kept apart in that record.

## The evidence on this candidate

| Evidence | Result |
| --- | --- |
| Python suite | 288/288 |
| Node suite (`tests/node/`, `apps/web/tests/`, `apps/worker/tests/`) | 277/277 |
| Database suite (PGlite) | 179/179 |
| Database suite (real PostgreSQL 18 in CI, 17 locally) | 20/20 across the six `pg-*.test.mjs` files |
| Lint | clean in every package |
| Typecheck | clean in every package |
| Production build | clean; shared first-load JavaScript 103 kB, heaviest route 113 kB, against a 120/140 kB budget |
| Production startup smoke | `SMOKE_OK` |
| Brand chrome smoke | passed, three viewports by three routes |
| Authenticated browser journeys | five scenarios against five disposable databases, including the invitation journey |
| Repository hygiene | clean, 1091 tracked files, the untracked `.ignore` never touched |
| Upstream provenance, agent contract, registry, Build Kit and skills validators | passing |
| No-model egress gate | passing on a clean environment, failing closed on a forbidden credential |
| Graft | 2721 nodes, 7901 edges, 330 cards; the wiring graph is in sync with the code; the blast radius reaches four areas at depth 2 |
| Exact-head CI | fifteen of fifteen checks green |
| PStack review panel | the full split panel plus a final all-bars judge over the last grain; every bar answered; the record is `docs/reviews/P00-G19_PSTACK_PANELS.md` |
| Alibaba Open Code Review | the delegated workflow only — **not** an LLM-backed scan; the record is `docs/reviews/P00-G19_OCR_DELEGATION.md` |

## The security position

- No unresolved blocking security finding. The review panel's findings on the
  last grain were closed and the closure was verified by mutation controls
  against the shipped code.
- The invitation surface's properties, each with the test that pins it: the
  token is 256 random bits stored only as a SHA-256 digest and returned
  once; the invitation is bound to one address and one role; the address is
  re-checked on both redemption paths; the acceptance is a guarded write
  under a row lock, so a revocation cannot race a redemption; the expiry and
  the state are the database's clock; one live invitation per workspace and
  address is a database index; the invitation surface answers with
  `Referrer-Policy: no-referrer`; and the sign-in destination cannot leave
  the origin.
- The known limitations are recorded rather than passed over: the token
  travels in the URL path and also discloses the invited address, the role
  and the workspace name; an operator who issues an invitation holds that
  secret and is trusted with the seat it grants; the refusal for an address
  that already holds an account is distinguishable by its status code, which
  is structural rather than a wording choice; and the roster is read-only in
  this grain.

## What is not the engineering's to do

The candidate ships nothing until the founder records these. They are
restated from the decision record, which is where they are answered.

- **OD-01** — approve v1 Local as replay-only, or approve a consent-UX design
  to build.
- **OD-02** — perform the production signing ceremony; until then the
  candidate is explicitly unsigned and no artifact may be presented as
  officially signed.
- **OD-03** — close Issue #62 on the recorded evidence or name the proof
  still required, and approve the version identifier and the
  release-candidate tag or draft. No final publication without this.
- **OD-04** — the Cloud commercial backlog's owner decisions.
- **OD-05** — the licence and notice placement, recorded in PR #148.

## What a reader should not conclude from this record

- That a release exists. Nothing was released, tagged, deployed or published.
- That the candidate is signed. It is explicitly unsigned.
- That the "deferred" items are gaps, or that the gaps are absent. The
  deferrals are authorised and have triggers; the open gates are the
  founder's.
- That a review tool that could not run was simulated. The Alibaba OCR
  record is a delegation record, and the PStack panel's judges were
  fresh-context sessions, which the record states plainly.
