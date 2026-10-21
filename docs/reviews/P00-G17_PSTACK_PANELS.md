# P00-G17 Review Stack Migration — PStack Review Panel

- Grain: `P00-G17` — replace the metered TypeSafe Jev merge gate with the zero-cost
  review stack.
- Branch: `skilit/p00-g17-governance-review-stack`
- Canonical base SHA: `3156969ab52d801258af616f1556023572c2990c`
- Reviewed policy candidate HEAD: `419796bee74992d99864ebf022520499c7bbcd1e`
- Reviewed diff: `3156969ab52d801258af616f1556023572c2990c...419796bee74992d99864ebf022520499c7bbcd1e`
  — 21 files: 19 Markdown, `.gitignore`, `UPSTREAMS.lock.yml`.
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.2: the combined judge answers **all four bars**,
  including security and privacy, on every grain, and the manifest records the base and
  candidate SHAs. This is the deviation recorded in decision §3.3.1.
- Judges: **four independent fresh-context judge sessions** (correctness, parsimony,
  product, security/privacy), plus **five independent fresh-context delta re-reviews**,
  plus **one independent fresh-context combined judge over the final candidate
  `8c08246`** (all recorded in §Delta history below). No judge authored the diff.
- **No TypeSafe Jev review was run for this grain and none is claimed.** The former Jev
  gate was waived for this one policy transition by explicit founder instruction, recorded
  in decision §2 and in the governing pull-request body. This is a waived gate, not a
  satisfied gate.
- Degraded level: **none**. Every bar was reviewed by an independent fresh-context
  judge.

## Panel manifest

```
panel: full — correctness ✓ (fresh-context judge) · parsimony ✓ (fresh-context judge) ·
product ✓ (fresh-context judge) · security ✓ (fresh-context judge) ·
deltas: five independent fresh-context delta re-reviews ✓ · final-candidate combined judge ✓ ·
base 3156969ab52d801258af616f1556023572c2990c · reviewed candidate 419796bee74992d99864ebf022520499c7bbcd1e ·
merge candidate: the commit carrying this record
```

The merge candidate differs from the reviewed policy candidate `419796b` only by:

1. the two review-record files under `docs/reviews/` (this file and
   `docs/reviews/P00-G17_OCR_DELEGATION.md`), which document the review;
2. `UPSTREAMS.lock.yml`: the `pstack` `verification_date` corrected from `2026-10-21` to
   `2026-10-20` — the UTC date on which the pin was actually verified and observed by CI
   — after the exact-head CI run failed three validator tests on a future-dated value;
3. `scripts/ci_hygiene.py`: `.claude` added to `FORBIDDEN_TRACKED_PARTS`, with a
   regression test in `tests/test_ci_hygiene.py`, so the review-tool skill install stays
   out of the tracked tree mechanically instead of by convention;
4. `docs/qualification/AF-12_ACCEPTANCE_MATRIX.md`: the R7 "Tests:" evidence inventory
   and the matrix's superseding note, both of which the final-candidate judge required to
   be made forward-looking, and the Post-Audit Delta entry this grain added.

Items 1–4 are covered by the five delta re-reviews and the final-candidate combined judge
recorded under §Delta history. No governance rule, panel bar, degraded level, or
historical record differs between `419796b` and the merge candidate: the only
non-evidence changes to the AF-12 matrix are its superseding note, the R7 inventory field
(which the final-candidate judge itself required to move forward-looking), and the
matrix's own delta-log entry that describes it.

**Date basis.** The decision document is dated **2026-10-21** in the founder's local
timezone (UTC+03:00). The upstream-pin verification and the GitHub CI evidence for this
change are dated **2026-10-20** in UTC, because the CI runner's clock is UTC and
`scripts/validate_upstreams.py` rejects a verification date later than the runner's
current date — the first exact-head run failed on exactly that check. Both dates
describe the same working session (the grain's commits start at 2026-10-20T23:32Z and
cross midnight UTC, so they are 2026-10-21 throughout in UTC+03:00). The lock file
records the UTC date, which is the one a CI runner can verify. This note lives here
rather than in the decision document so that the normative document stays byte-identical
to the candidate the panel reviewed.

## Correctness — PASS (after fixes)

- The initial pass raised four must-fix findings. All four were fixed and confirmed by
  the delta re-review:
  1. the security/privacy bar was conditional on the split panel — now **unconditional**
     for every grain (decision §3.1, §3.2);
  2. `GOVERNANCE.md` and the decision document contradicted each other on whether a
     self-review may satisfy the gate — now one consistent rule, with the degraded
     levels defined in decision §3.4 and referenced from `GOVERNANCE.md`;
  3. the decision document asserted the pull request was already qualified — now it
     states the qualification happens **before merge** and points at the evidence
     locations;
  4. the AF-12 R7 evidence inventory had dropped "Jev" although
     `docs/reviews/*_JEV_REVIEW.*` files exist on disk — **restored**; the forward-looking
     change is recorded in the matrix's superseding note and its Post-Audit Delta log.
- Also fixed: two historical paragraphs had been split mid-sentence by an inserted note
  (`DEV_READINESS_2026-10-17.md`, `ISSUE_9_MATRIX.md`) — restored intact; the
  `V1_LOCAL_ACCEPTANCE_CONTRACT.md` note's section locator pointed at the wrong section —
  corrected to the R7 row, field 3, under §2; two superseding notes pointed at Jev
  mentions that no longer existed — reworded to state the actual change.
- Verified independently: all remaining case-insensitive "Jev" hits outside
  `docs/reviews/` are either the waiver statement itself or an explicitly labelled
  historical record; `git diff 3156969...419796b -- docs/reviews/` is empty, so the
  historical evidence is byte-identical to the base.

## Parsimony — PASS (after fixes)

- The initial pass raised seven must-fix findings. All seven were fixed:
  1. `GOVERNANCE.md` restated the decision document's rules and had already drifted
     between the two — the decision document is now the single normative source and
     `GOVERNANCE.md` names the gates and links;
  2. decision §3.3–§3.6 restated policy that already lived unchanged in
     `GOVERNANCE.md` and `docs/operations/CI.md` — condensed to one short subsection per
     unchanged gate with pointers;
  3. the GitHub ruleset was copied as seven prose bullets that enforce nothing — removed,
     with the statement that GitHub enforces it natively;
  4. a `docs/reviews/<GRAIN>_GRAFT_BLAST.md` evidence convention was invented with no
     instance anywhere — removed; graft evidence lives inside the panel record;
  5. six near-identical four-to-five-line superseding notes — each reduced to one line;
  6. the two mid-sentence note insertions — moved below their paragraphs;
  7. the wrong section locator — corrected.
- Also acted on the worth-considering items: the one-time exception paragraph and the
  "does not do" list were compressed to what the founder actually required; the
  self-referential "Review of this decision" and "Related records" sections were folded
  away. The decision document carries strictly more required content than the original
  draft (the four-bar mandate, the degraded taxonomy, the amendment-authority clause, the
  OCR egress rule, and the upstream-composition deviation clause) while the duplication
  and restatement were removed.
- The file set was checked against the founder's "dedicated, narrow" instruction: every
  changed file carried a live Jev reference, a live gate statement, the upstream pin, the
  ignore rule, or the mechanical enforcement of that ignore rule. No file was changed
  without a concrete reason.
- The one code change — `scripts/ci_hygiene.py` plus one regression test — was preferred
  over relying on the `.gitignore` convention alone, because the security judge identified
  the convention as unenforceable: a future `git add -A` could commit third-party agent
  instructions. One line of enforcement is smaller than the risk it removes.

## Product — PASS (after fixes)

- The initial pass raised three must-fix findings. All three were fixed.
- Checked against the founder's directive point by point.
- The directive requires: inspect the current governance and all Jev references (done —
  every non-historical reference enumerated); prepare a dedicated, narrow
  governance-change PR (done); record the decision in a durable governance decision
  document (done — `docs/governance/DECISION_2026-10-21_REVIEW_STACK_MIGRATION.md`);
  remove Jev as a mandatory merge gate (done); define a replacement zero-cost quality
  and review process (done — §3.1–§3.7); explain why the former requirement was waived
  (done — §1 founder rationale); do not state or imply historical Jev reviews were
  completed (done — §1, §2, §4 and the historical notes say the opposite); update
  templates, checklists and documentation that still describe Jev as mandatory (done for
  everything on this branch); keep the GitHub-native ruleset protecting `main` (done —
  `.github/` is byte-identical to the base and the ruleset is untouched); verify all 15
  GitHub CI checks on the exact candidate before merging (recorded in the pull-request
  body against the exact candidate HEAD).
- The founder's explicit requirement that the exception be transparent is honoured
  literally: decision §2 states that the former gate "was not satisfied and is not claimed
  to have been satisfied", that no Jev review was run, and that the exception does not
  recur. No sentence in the diff claims compliance with the former gate.
- The founder's "do not fabricate a GitHub approval" requirement is honoured: the diff
  contains no approval, reviewer, or sign-off claim of any kind.
- No fabricated scope: the evidence-file naming matches the repository's existing
  `docs/reviews/` convention; no product, schema, migration, dependency, brand asset,
  release, or deployment change is present in the diff.
- Fixed after the first pass: the "already qualified" claim in §2, the dangling Jev
  references in two superseding notes, and the install command's failure on a fresh clone.

## Security and privacy — PASS (after fixes)

- The initial pass raised two must-fix findings, both now fixed:
  1. **D1 self-review could have satisfied the security bar on a security-trigger
     surface**, defeating the fail-closed character of the gate it replaces. Decision
     §3.4 now forbids it: such a grain requires an independent fresh-context security
     judge or explicit founder sign-off, and is otherwise blocked.
  2. **the review stack could have been widened, weakened, or self-approved by the agents
     it governs.** The "Amendment authority" clause requires explicit founder
     authorisation plus an independent full split panel for any change to the decision
     document, to `GOVERNANCE.md`'s review-stack section, or to the degraded levels, and
     states that D1 may not qualify a review-stack change.
- The `SECURITY.md` "Merge Rule" is carried into the new policy: a known security
  boundary violation remains blocking and cannot be waived by model-generated review
  confidence.
- The upstream review tool is registered in `UPSTREAMS.lock.yml` (`pstack`, role
  `dev_gate`, licence MIT, pinned commit `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701`,
  the full installed path list), so `scripts/validate_upstreams.py` verifies the pin in CI —
  `UPSTREAMS_VALIDATION_PASSED sources=39`. The installed skill files are third-party
  agent instructions: the decision requires the installed file list and hashes to be
  recorded before use and forbids editing them after installation, `.gitignore` keeps the
  install out of the tree, and `scripts/ci_hygiene.py` now fails any tracked path under a
  `.claude` directory.
- Alibaba OCR provider-backed review is explicitly **external egress** governed by
  `SECURITY.md` "External AI and Data Egress": only the exact diff may leave the machine;
  workspace content, credentials, key material, `.env` contents, and unredacted logs may
  not; and the record must state provider identity, egress classification, and retention.
- The "risk-specific check" obligation is defined by reference to the `SECURITY.md`
  "Mandatory Regression Matrix" and `docs/IMPLEMENTATION_PLAN.md` §21 "Mandatory Security
  Qualification Matrix", so D1 and D2 compliance is auditable rather than assertable.
- Verified independently: no secret, credential, token, internal hostname, or local
  machine path appears anywhere in the diff; `SECURITY.md`,
  `docs/IMPLEMENTATION_PLAN.md` §21, `scripts/check_no_model.py`, and `packages/no-model`
  are untouched, so the no-model and no-unauthorized-egress rules are unaffected.

## Delta history

- **Delta 1 — `419796b..686789b`** (reviewed by an independent fresh-context delta
  judge). It contained the two review-record files, the `UPSTREAMS.lock.yml`
  verification-date fix, and a seven-line date-basis amendment to the decision document.
  The judge confirmed the date fix, confirmed that no other verification date in the lock
  is later than 2026-10-20 and therefore at risk of the same CI failure, and confirmed the
  date-basis paragraph's account of the two dates. It raised two must-fix findings against
  the *records*: the normative decision document had been amended after the panel bound to
  `419796b`, which its own amendment-authority clause forbids; and the manifest did not
  bind to the merge candidate. The date-basis paragraph was therefore **moved out of the
  decision document into this record** (reverted in `8c08246`), so the normative document
  is byte-identical to the reviewed candidate, and the manifest now states the
  merge-candidate relationship explicitly.
- **Delta 2 — `8c08246` (the final candidate)** — reviewed by an independent
  fresh-context combined judge over the complete final diff, covering all four bars. Its
  findings and disposition are recorded below. Three must-fix findings were raised
  against this record and the OCR record, and all three were fixed in the merge candidate
  that follows `8c08246`.
- **Delta 3 — `dfcdb58..3173d75`** — reviewed by an independent fresh-context delta
  judge. It confirmed the three Delta-2 fixes and raised three further must-fix findings
  against this record and the OCR record: the OCR exclusion breakdown was wrong (21
  `unsupported_ext` plus one `default_path`, not 22 `unsupported_ext`); the AF-12
  Post-Audit Delta entry still described the old R7 inventory text; and this record's
  finding table omitted one worth-considering item from the judge's summary count while
  mislabelling another item's severity. All three were fixed, and the judge confirmed
  the decision document still byte-identical and the historical evidence still untouched.
- **Delta 4 — `3173d75..2d32516`** — reviewed by an independent fresh-context delta
  judge. It confirmed the three Delta-3 fixes and raised three further must-fix findings
  against this record: the top-level verdict under-counted the panel's must-fix findings;
  the "merge candidate differs only by" list omitted the AF-12 matrix amendment; and the
  Graft coverage limitation paragraph counted 24 non-graph files where 23 are correct,
  because `tests/test_ci_hygiene.py` is Python and was parsed. All three were fixed.
- **Delta 5 — `2d32516..5fa8a5a`** — reviewed by an independent fresh-context delta
  judge. It confirmed the three Delta-4 fixes and raised one must-fix finding — the delta
  re-review count was stated three different ways across this record's header, its
  manifest, its "differs only by" paragraph, and the OCR record's findings paragraph —
  plus three worth-considering findings: the narrowed no-change sentence enumerated only
  two of the three AF-12 matrix changes, the date-basis parenthetical quoted a commit
  range that excluded the grain's HEAD commit, and the OCR record's final-candidate
  heading called `8c08246` "the merge candidate". All four were fixed.
- **Delta 6 — `5fa8a5a..55f288aa`** — reviewed by an independent fresh-context delta
  judge. It confirmed the four Delta-5 fixes and raised one must-fix finding — the OCR
  record's carry-forward paragraph claimed the merge candidate added only the two
  evidence-record files, contradicting this record's item 4 — plus one worth-considering
  finding: the date-basis parenthetical still quoted a fixed end time. Both were fixed.

**The trailing review round.** This record is part of the diff it documents, so the round
that reviews the commit carrying it cannot be written into this file: its findings are
necessarily recorded in the commit that fixes them and in the governing pull-request
body instead. The rounds enumerated above are therefore the complete set of rounds
**recorded in this file**; the count is stated for that set, and the next round's
findings are carried by the merge commit's message and the pull-request body.

**Total must-fix findings raised against this grain and fixed:** the initial four-bar
panel raised 16 (four correctness, seven parsimony, three product, two security and
privacy); Delta 1 raised 2; the final-candidate combined judge raised 3; Delta 3 raised 3;
Delta 4 raised 3; Delta 5 raised 1; Delta 6 raised 1 — **29 across the six rounds
enumerated above, all fixed**. The trailing round's must-fix is recorded in the merge
commit's message and is fixed there.

**Range convention.** Each delta entry's range runs from the state the judge reviewed to
the commit that fixed its findings. Delta 1's range is the whole diff from the reviewed
candidate to the state judged, and its fix landed in `8c08246`; Delta 2 names a single
candidate, `8c08246`, because that round reviewed the whole final diff rather than a
delta.

## Final-candidate review (all four bars, independent fresh-context judge)

Reviewed diff: `3156969ab52d801258af616f1556023572c2990c...8c082465dec4a8fda0ed77526587d500fb0f19c5`
(25 files). Independent fresh-context judge. Verdict as returned:

- **Correctness — FAIL.** Three must-fix findings (below), all against the evidence
  records rather than the policy text.
- **Parsimony — PASS.** "The decision document is the single normative source;
  `GOVERNANCE.md` names gates and links without restating them; one line of code plus one
  test for the enforcement; superseding notes reduced to one line each. No speculative
  abstraction, no duplicated rule sets, no dead paths."
- **Product completeness and specification alignment — FAIL.** Two findings (one must-fix
  against the OCR record, one worth-considering against the AF-12 matrix), plus
  confirmation that the directive itself is fully covered.
- **Security and privacy — PASS.** Confirmed that the degraded path cannot let an agent
  self-approve a security-sensitive change, that `SECURITY.md` and
  `docs/IMPLEMENTATION_PLAN.md` §21 are untouched, that no secret, credential, token,
  internal hostname, or local machine path appears in the diff, and that the new
  `ci_hygiene.py` rule is strictly additive to the control set.

The judge's manifest line reported `MUST-FIX=3 WORTH=3 SKIP=1`; its finding text
enumerated three must-fix, two worth-considering, and one skip finding. Every finding it
enumerated is dispositioned below. Its summary count includes one additional
worth-considering item that its finding text did not enumerate, so the panel records the
count discrepancy rather than inventing a finding.

Findings raised by the final-candidate judge and their disposition:

| Finding | Severity as reported | Disposition |
| --- | --- | --- |
| The quoted Graft output was stale (`0 areas changed`); at the merge candidate it is `1 area changed` (`ci_hygiene.py`) | must-fix | fixed: the graft evidence below now quotes the merge-candidate output, including the affected area and the updated not-in-the-graph count |
| The record asserted a "zero must-fix" verdict for a final-candidate judge whose report did not yet exist | must-fix | fixed: this section now reports the judge's actual verdict, including its two FAIL bars and the findings it raised |
| The OCR record bound to the superseded candidate `419796b`, whose exact diff has `reviewable_count = 3` (the judge's wording; the live count for `419796b` is 2, and 3 is the merge candidate's count — the substance of the finding is that the merge candidate adds `scripts/ci_hygiene.py` as a third reviewable file); `scripts/ci_hygiene.py` had no OCR applicability evidence | must-fix | fixed: `docs/reviews/P00-G17_OCR_DELEGATION.md` now carries a final-candidate section with the merge-candidate preview, the resolved Python rule group, and the delegated review of `scripts/ci_hygiene.py` |
| The delta-1 range description omitted the decision-document amendment | worth-considering | fixed: the delta-1 entry above now names it |
| The AF-12 R7 evidence inventory still named Jev while the matrix's superseding note claimed every forward-looking gate statement names the PStack panel | worth-considering | fixed: the inventory is now forward-looking and names the records new grains produce, and the preserved `*_JEV_REVIEW.*` files are named explicitly as historical evidence |
| The `.gitignore` rule covers `/.claude/skills/` while the hygiene rule bans any tracked path under `.claude` | skip | accepted as fail-closed and asymmetric in the safe direction; no `.claude` path is tracked today |

### Mechanical evidence verified by the final-candidate judge

- `ocr delegate preview --from 3156969... --to 419796b` → 21 files, `reviewable_count = 2`
  (`.gitignore`, `UPSTREAMS.lock.yml`), 19 excluded, 414 insertions, 35 deletions — the
  numbers quoted in the OCR record are exact.
- `git diff 419796b..8c08246 --stat` → exactly the five files this record claims.
- `git diff 419796b..8c08246 -- docs/governance/` → empty; the decision document is
  byte-identical to the reviewed candidate.
- `git diff 3156969..8c08246 --stat -- docs/reviews/` → only the two new `P00-G17_*`
  files; no pre-existing review record was touched.
- Local gate: 279 tests OK; `UPSTREAMS_VALIDATION_PASSED sources=39`;
  `CI_HYGIENE_PASSED tracked_files=1038`; `SKILLS_VALIDATION_PASSED skills=4`;
  `AGENT_CONTRACT_PASSED`; `BUILD_KIT_VALIDATION_PASSED`; `REGISTRY_VALIDATION_PASSED`.
- The new hygiene test is non-vacuous: with `.claude` removed from the forbidden set the
  same tracked path is accepted; with the rule present it is rejected.
- The upstream pin `faa4e9fb…` is the `main` HEAD of `github.com/phthomas/pstack`, MIT
  licensed, and `.claude/skills/` at that commit contains exactly the eleven `ps-*`
  directories listed in `imported_paths`.
- `.github/workflows/ci.yml` defines 14 jobs and 15 expanded checks (the `storage` job
  runs a two-OS matrix), so "15 GitHub CI checks" is accurate.

## Mechanical evidence

- Python suite: `python3 -m unittest discover -s tests` — **279 tests, OK** (278 at the
  reviewed candidate, plus the hygiene regression test added with the `ci_hygiene.py`
  enforcement change).
- Validators: `validate_upstreams.py` (39 sources), `validate_skills.py` (4 skills),
  `validate_agent_contract.py`, `validate_build_kit.py`, `validate_registry.py` — all pass.
- Repository hygiene: `python3 scripts/ci_hygiene.py --expected-head <merge candidate>` —
  `CI_HYGIENE_PASSED`.
- Graft `0.21.1`: `graft build --no-gitignore --no-ignore .` exit 0; `graft check .` —
  `graph check: OK — the wiring graph is in sync with the code`;
  `graft blast --base 3156969ab52d801258af616f1556023572c2990c --format markdown` at
  the merge candidate — the single affected area is **`ci_hygiene.py` — no function, method
  or class changed here**, with **no indexed dependents at depth 2**. 23 of the 25 changed
  files are not in the graph.
- **Graft coverage limitation, stated explicitly:** Graft's parsers cover JavaScript,
  Python, TypeScript, and TSX. The two changed Python files — `scripts/ci_hygiene.py` and
  `tests/test_ci_hygiene.py` — are parsed; the other 23 changed files are Markdown,
  `.gitignore`, and `UPSTREAMS.lock.yml`, and Graft reports those as "not in the graph — no
  parser claims the extension". The blast result therefore establishes that **no indexed
  implementation module depends on this diff** and that neither changed Python module
  changes a function, method, or class; it does not and cannot analyse the Markdown prose
  or the JSON-valued lock file. The prose is covered by the four review bars above, and
  the Python changes are covered by the `bootstrap` CI job.
- TypeScript, ESLint, the Node suites, the web production build, the Lens and database
  suites, and the remaining hosted jobs are exercised by the exact-head GitHub CI run
  recorded in the governing pull request.

## Verdict

Zero **unresolved** must-fix findings remain. Twenty-nine must-fix findings were raised
against this grain — sixteen by the initial four-bar panel and thirteen across the six
later rounds (two delta re-reviews, one final-candidate combined judge, and three further
delta re-reviews) — and every one is fixed and dispositioned above. The final-candidate
combined judge returned
`correctness=FAIL · parsimony=PASS · product=FAIL · security=PASS`; the delta rounds
confirmed each fix against live tool output. The grain is cleared for merge under the
replacement review stack, with the former Jev gate recorded as waived rather than
satisfied.
