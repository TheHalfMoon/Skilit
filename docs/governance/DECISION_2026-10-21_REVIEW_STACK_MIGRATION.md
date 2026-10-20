# Governance Decision — Review Stack Migration (Jev Gate Waived)

Decision ID: `GD-2026-10-21-REVIEW-STACK`
Status: **accepted and canonical**
Date of decision: 2026-10-21
Authority: repository founder and owner (`TheHalfMoon`), by explicit written directive. The
directive is not an in-repository artifact; it is recorded verbatim in the governing pull
request body and summarised in §1 and §2 of this document, which together are its durable
in-repository trace.
Supersedes: the "Mandatory TypeSafe Jev Gate" section of `GOVERNANCE.md` as it existed at
base `3156969ab52d801258af616f1556023572c2990c`.
Applies: prospectively, from the merge of the pull request carrying this record.

This document is the normative source for the **review stack**: the bars, the panel
composition, the degraded-review taxonomy, and the evidence convention. `GOVERNANCE.md`
states which gates exist and links here; it does not restate these rules, so there is one
place to change and no place to drift.

---

## 1. Decision

The mandatory TypeSafe Jev review gate is **removed** from Skilit governance.

Jev is no longer a merge gate, a release gate, or a blocker for any grain, pull request,
or release-readiness claim. It is not reactivated by any later decision unless the founder
issues a new explicit written instruction.

This is a **waiver of a formerly mandatory gate**, not a satisfaction of it.

Founder's rationale:

- TypeSafe Jev is a **metered API**.
- Skilit must incur **zero out-of-pocket cost** for the founder.
- Engineering completion must not be **blocked indefinitely** by an unavailable or paid
  review service.
- Suitable **open-source and locally executable** review workflows are available.

Two things this decision explicitly does **not** do:

- it does not assert that historical Jev reviews were completed for any grain — where the
  repository's historical review records say so, those records remain valid and untouched;
- it does not assert that any Jev review was performed for the governance migration
  itself.

---

## 2. The one-time, explicitly-approved exception for this transition

The governance migration pull request was previously subject to the Jev gate, because the
Jev gate was the policy in force when its diff was produced. The founder authorised **one
explicit, one-time, owner-approved exception** for exactly this policy transition.

For that pull request: the former Jev gate **was not satisfied** and is **not claimed to
have been satisfied**; no Jev review was run; the pull request is qualified under §3 below
before it merges, and its pull-request body records the panel findings, the OCR
applicability result, the Graft evidence, and the exact-head CI run in the same terms.
This exception does not recur.

---

## 3. The review stack

Four classes of evidence are required for every governed grain. A green CI run alone is
never sufficient, and no single tool's verdict substitutes for the others.

1. **PStack review panel** — §3.1–§3.4. The mandatory review gate.
2. **Alibaba Open Code Review** — §3.5. Unchanged.
3. **Graft** — §3.6. Unchanged.
4. **Exact-head GitHub CI and the mechanical suites** — §3.7. Unchanged.

### 3.1 The four bars

Every relevant grain is reviewed against all four bars. **All four are mandatory for every
grain**; none is conditional on the diff's shape.

1. **Correctness** — does the code do what its tests claim; are errors and edge cases
   handled at the boundaries; are there races, leaks, or injection points; do the tests
   genuinely check the grain's criteria rather than mirroring the implementation.
2. **Parsimony** — is this the simplest thing that works; flag unnecessary abstraction,
   premature generalization, speculative flexibility, a reinvented standard library, a
   dependency where a native feature serves, dense or clever code that hides intent, dead
   code, and needless layers.
3. **Product completeness and specification alignment** — is anything specified but
   missing; is anything built that was not specified (invented scope is flagged even when
   it is good); is any acceptance criterion satisfied in letter but missed in intent.
   Style is out of scope; the other bars own it.
4. **Security and privacy** — are inputs validated at the boundary; are secrets never
   logged or committed; is authorization checked on every new path.

### 3.2 Panel composition

The default panel is **one combined fresh-context judge** that answers **all four bars**
separately in a single read of the diff. Bar 4 is not optional and not deferred to a
split panel; the default judge always answers it.

The **full split panel** — a correctness judge per surface, a parsimony judge, a product
judge, and a security judge as its own judge — runs additionally when the diff earns it:
a security trigger surface is touched (auth or sessions, secrets or keys, file upload,
money movement, deserialization, or raw external input reaching shell/SQL/eval), more than
one surface is touched, a close over parked or flagged work, or the founder asks for it.

Judges run on the session model. A delta re-review inside a fix cycle re-checks only the
changed findings, not the whole diff.

Every panel **binds to the exact base SHA and the exact candidate HEAD** and covers every
changed hunk of that diff. The manifest line records both SHAs.

Verdicts merge into **must-fix / worth-considering / skip-it**, each finding naming its
location, the issue, and the concrete fix. Arbitration: the specification and `PRODUCT.md`
are the objective function, and **parsimony wins ties** — unbuilt abstraction is cheap to
add later, built abstraction is expensive to remove.

### 3.3 Mechanism

The panel is the upstream PStack `ps-review` workflow,
`https://github.com/phthomas/pstack` (MIT licence, markdown-only, no paid provider),
pinned at upstream commit `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1).

The skills are not vendored into this repository. A grain that runs the panel installs
them from the pinned upstream commit, cloning **outside** the worktree so the checkout
never lands in the repository:

```sh
PSTACK_DIR="${TMPDIR:-/tmp}/pstack"
git clone https://github.com/phthomas/pstack.git "$PSTACK_DIR"
git -C "$PSTACK_DIR" checkout faa4e9fb22e5cd19ac85ca094f6056ba89eaa701
mkdir -p .claude/skills
cp -r "$PSTACK_DIR"/.claude/skills/ps-* .claude/skills/
```

The clone is free and offline-capable once fetched. The upstream source is registered in
`UPSTREAMS.lock.yml` as `pstack` (role `dev_gate`, licence MIT, pinned to the commit
above), so `scripts/validate_upstreams.py` verifies the pin in CI. The installed skill
files are third-party agent instructions: a grain records the installed file list and
their hashes before use, and never edits them after installation.

### 3.3.1 Deviation from the upstream default composition

Upstream's `ps-review` default is a light panel: **one combined judge carrying bars 1-3**,
with security run as its own judge **only on trigger surfaces**, and a manifest template
that does not carry SHAs.

**Skilit supersedes that default.** Where the upstream workflow and this document differ,
this document wins:

- the combined judge must answer **all four bars** (§3.1), including security and privacy,
  on every grain;
- the panel record must show that bar 4 was answered;
- the manifest line must be extended with the base and candidate SHAs (§3.2).

A grain that cannot extend the upstream run in this way records the run as the
**inline-bar fallback** (§3.4, level D2) and says so in the record. No grain may present a
light upstream panel as satisfying §3.1.

Where the skills are not installed, the grain applies the four bars in §3.1 directly and
records that the panel ran as the **inline-bar fallback** (§3.4), never as an
upstream-workflow run.

### 3.4 Fresh context and degraded review

**Fresh context is the load-bearing requirement.** A judge must run in a context that did
not author or debug the diff. Reviewing a diff in the authoring session is self-review.

The default and the required form is independent fresh-context review. Where a genuinely
independent fresh-context judge cannot be obtained for a grain, the grain records the
review as **degraded** at the weakest available level and satisfies the additional
obligations below. A degraded review does not automatically pass.

Degraded levels, weakest first:

| Level | Meaning | Additional obligations |
| --- | --- | --- |
| **D1 — self-review** | the authoring session reviews its own diff against the four bars | the mechanical suites in §3.7 must pass, **and** every risk-specific check the panel could not independently assert must be run and stated explicitly |
| **D2 — inline-bar panel** | a fresh session applies the four bars directly, without the upstream panel workflow | the mechanical suites in §3.7 must pass, **and** every risk-specific check the panel could not independently assert must be run and stated explicitly |

**Risk-specific checks** are the applicable rows of the `SECURITY.md` "Mandatory
Regression Matrix" and of `docs/IMPLEMENTATION_PLAN.md` §21 "Mandatory Security
Qualification Matrix", executed and recorded for the grain. They are the checks a review
panel can assert but cannot itself prove.

**D1 may not satisfy bar 4** for a grain that touches a §3.2 security trigger surface
(auth or sessions, secrets or keys, file upload, money movement, deserialization, or raw
external input reaching shell/SQL/eval). Such a grain requires an independent
fresh-context security judge, or explicit founder sign-off recorded in its pull-request
body; otherwise it is blocked. This preserves the fail-closed character of the gate it
replaces.

`SECURITY.md`'s "Merge Rule" continues to bind review evidence: a known security
boundary violation is blocking and cannot be waived by model-generated review confidence.

Every review record ends with an explicit manifest line stating what ran, which reviewers,
at which level, and the base and candidate SHAs. Degraded is allowed; invisible is not. A
degraded review is never described as an independent review, and a D1 review is never
described as independent.

### 3.5 Alibaba Open Code Review — unchanged

Mandatory for every governed code or configuration diff.

- Preferred mode is an exact-diff review against the canonical base using a configured OCR
  provider.
- Where no provider credential is available, the official `ocr delegate preview` and
  `ocr delegate rule` workflow is used, with resolved official rules applied to all
  applicable changed source and configuration files.
- Delegation is a **delegated review**; the record must not describe it as an external
  model scan or an LLM-backed OCR scan.
- Documentation-only grains still run `ocr delegate preview` against the exact diff. If
  `reviewable_count = 0` solely because the changed file types are unsupported, record
  OCR as not applicable with the preview evidence attached; do not claim OCR reviewed those
  files.
- Zero unresolved blocking OCR findings before merge.

A provider-backed OCR review is **external egress** and is governed by `SECURITY.md`
"External AI and Data Egress": it transmits only the exact diff; it never transmits
workspace content, credentials, key material, `.env` contents, or unredacted logs; and the
record in `docs/reviews/<GRAIN>_OCR_DELEGATION.md` states the provider identity, the
egress classification, and the retention behaviour.

### 3.6 Graft — unchanged

Mandatory for every implementation grain: `graft build` on the exact candidate HEAD,
`graft check` succeeding, `graft blast --base <canonical-base> --format markdown` against
the actual base, affected modules and tests identified, and parser and graph coverage
limitations documented explicitly. Graft output is architecture and change-impact
evidence; it does not replace test or review evidence.

### 3.7 GitHub CI and the mechanical suites — unchanged

All required GitHub CI checks must pass on the **exact candidate HEAD**. The GitHub
ruleset protecting `main` is preserved exactly as configured by GitHub; it is enforced
natively there and is not restated in prose. A grain records the ruleset identifier and
its required-check list in its pull-request body, so the state that governed the merge is
visible in the merge record. Do not remove, skip, or weaken tests to make a pull request
green.

The applicable local suites, run against the exact candidate, are: TypeScript strict
typecheck and ESLint; unit tests; integration tests; real Playwright/Chromium end-to-end
tests; authentication and authorization tests; workspace isolation tests; REST/MCP
interoperability tests; security and negative-path tests; accessibility and responsive
checks; production build; reproducible installation proof; the existing Python suites; and
GitHub Actions.

---

## 4. Historical records

The repository's historical review records under `docs/reviews/` and the historical
per-pull-request entries in `docs/qualification/` are **preserved unchanged**. They are
evidence of what actually ran at that time and are not to be rewritten, re-labelled, or
deleted to reflect this decision. Where a historical document also states a
forward-looking gate, the superseding note at the top of that document carries the change,
and the historical body is left intact.

---

## 5. Cost governance consequence

This decision reinforces, and does not relax, the existing cost governance: Skilit must
not depend on a paid API, metered inference, paid hosting, managed database with charges,
or unexpected cloud compute as a completion requirement.

Any future proposal to reinstate a paid review gate is a **founder decision** and requires
explicit written authorisation. It may not be reintroduced by an agent, a reviewer, or a
convenience argument.

### Amendment authority

Changing this document, changing the review-stack section of `GOVERNANCE.md`, or changing
the degraded levels in §3.4 requires **explicit founder authorisation** recorded in the
governing pull-request body, and an **independent full split panel** (§3.2). **D1 may not
satisfy the review of a review-stack change.** A review-stack change is otherwise blocked.

This clause is what keeps the review stack from being widened, weakened, or self-approved
by the very agents it governs.

---

## 6. Review evidence convention

Per-grain review evidence is recorded as `docs/reviews/<GRAIN>_PSTACK_PANELS.md`
(panel findings, degraded level, manifest line) and `docs/reviews/<GRAIN>_OCR_DELEGATION.md`
(whether the OCR review was provider-backed or delegated). Graft build, freshness, and
blast evidence is recorded inside the panel record.

`docs/reviews/<GRAIN>_JEV_REVIEW.*` files are not produced for new grains. Existing ones
are historical artifacts and stay in place.
