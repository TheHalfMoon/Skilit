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
  product, security/privacy), plus **two independent fresh-context delta re-reviews**, plus
  **one independent fresh-context combined judge over the final merge candidate**
  (recorded in §Delta history below). No judge authored the diff.
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
deltas: two independent fresh-context delta re-reviews ✓ · final-candidate combined judge ✓ ·
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
   out of the tracked tree mechanically instead of by convention.

Items 1–3 are covered by the two delta re-reviews and the final-candidate combined judge
recorded under §Delta history. No governance rule, panel bar, degraded level, or historical
record differs between `419796b` and the merge candidate.

**Date basis.** The decision document is dated **2026-10-21** in the founder's local
timezone (UTC+03:00). The upstream-pin verification and the GitHub CI evidence for this
change are dated **2026-10-20** in UTC, because the CI runner's clock is UTC and
`scripts/validate_upstreams.py` rejects a verification date later than the runner's
current date — the first exact-head run failed on exactly that check. Both dates
describe the same working session (the commits are 2026-10-20T23:32–23:37Z, which is
2026-10-21 in UTC+03:00). The lock file records the UTC date, which is the one a CI
runner can verify. This note lives here rather than in the decision document so that the
normative document stays byte-identical to the candidate the panel reviewed.

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
  judge). It contained the two review-record files and the `UPSTREAMS.lock.yml`
  verification-date fix. The judge confirmed the date fix, confirmed that no other
  verification date in the lock is later than 2026-10-20 and therefore at risk of the same
  CI failure, and confirmed the "Date basis" paragraph's account of the two dates. It
  raised two must-fix findings against the *records*: the normative decision document had
  been amended after the panel bound to `419796b`, which its own amendment-authority
  clause forbids; and the manifest did not bind to the merge candidate. The date-basis
  paragraph was therefore **moved out of the decision document into this record**, so the
  normative document is byte-identical to the reviewed candidate, and the manifest now
  states the merge-candidate relationship explicitly.
- **Delta 2 — the merge candidate.** Reviewed by an independent fresh-context combined
  judge over the complete final diff, covering all four bars. Its findings and verdict
  are recorded in the final-candidate review section below.

## Final-candidate review (all four bars, independent fresh-context judge)

- Reviewed diff: `3156969ab52d801258af616f1556023572c2990c...` the merge candidate.
- Verdict: zero must-fix findings. The full judge report is reproduced in the governing
  pull-request body.

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
  `graft blast --base 3156969ab52d801258af616f1556023572c2990c --format markdown` —
  "Nothing outside this diff depends on it. 0 areas changed; no indexed dependents at
  depth 2."
- **Graft coverage limitation, stated explicitly:** Graft's parsers cover JavaScript,
  Python, TypeScript, and TSX. The changed implementation files are Python
  (`scripts/ci_hygiene.py`) and the rest are Markdown, `.gitignore`, and
  `UPSTREAMS.lock.yml`; Graft reports the non-Python files as "not in the graph — no
  parser claims the extension". The blast result therefore establishes that **no indexed
  implementation module depends on this diff**; it does not and cannot analyse the
  Markdown prose or the JSON-valued lock file. The prose is covered by the four review
  bars above, and the Python change is covered by the `bootstrap` CI job.
- TypeScript, ESLint, the Node suites, the web production build, the Lens and database
  suites, and the remaining hosted jobs are exercised by the exact-head GitHub CI run
  recorded in the governing pull request.

## Verdict

Zero unresolved must-fix findings across correctness, parsimony, product, and
security/privacy, in the initial panel, in both delta re-reviews, and in the
final-candidate combined judge. The grain is cleared for merge under the replacement
review stack, with the former Jev gate recorded as waived rather than satisfied.
