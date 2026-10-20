# P00-G17 Review Stack Migration — PStack Review Panel

- Grain: `P00-G17` — replace the metered TypeSafe Jev merge gate with the zero-cost
  review stack.
- Branch: `skilit/p00-g17-governance-review-stack`
- Canonical base SHA: `3156969ab52d801258af616f1556023572c2990c`
- Reviewed candidate HEAD: `419796bee74992d99864ebf022520499c7bbcd1e`
- Reviewed diff: `3156969ab52d801258af616f1556023572c2990c...419796bee74992d99864ebf022520499c7bbcd1e`
  (21 files: 20 Markdown, `.gitignore`, `UPSTREAMS.lock.yml`).
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.2: the combined judge answers **all four bars**,
  including security and privacy, on every grain, and the manifest records the base and
  candidate SHAs. This is the deviation recorded in decision §3.3.1.
- Judges: **four independent fresh-context judge sessions** (correctness, parsimony,
  product, security/privacy) plus one **independent fresh-context delta re-review**.
  No judge authored the diff.
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
deltas: independent fresh-context delta re-review ✓ ·
base 3156969ab52d801258af616f1556023572c2990c · candidate 419796bee74992d99864ebf022520499c7bbcd1e
```

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
  corrected to the R7 row, field 3, under §2.
- Verified independently: all 41 remaining case-insensitive "Jev" hits outside
  `docs/reviews/` are either the waiver statement itself or an explicitly labelled
  historical record; `git diff 3156969...HEAD -- docs/reviews/` is empty, so the
  historical evidence is byte-identical.
- Delta re-review verdict: 17 of 17 verification items resolved, except the two
  paragraph-splitting defects and two dangling note references, all of which are fixed
  in this candidate.

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
  away; the decision document went from 263 lines to 267 lines while carrying strictly
  more required content (the four-bar mandate, the degraded taxonomy, the amendment
  authority clause, the OCR egress rule, and the upstream-composition deviation clause
  were added as the duplication and restatement were removed).
- The file set was checked against the founder's "dedicated, narrow" instruction: every
  one of the 21 changed files carried a live Jev reference, a live gate statement, or the
  upstream pin and the ignore rule that keep the review tool out of the tree. No file
  was changed without a concrete reason.

## Product — PASS (after fixes)

- Checked against the founder's directive point by point.
- The directive requires: inspect the current governance and all Jev references (done —
  all 41 non-historical references enumerated); prepare a dedicated, narrow
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
     it governs.** The new "Amendment authority" clause requires explicit founder
     authorisation plus an independent full split panel for any change to the decision
     document, to `GOVERNANCE.md`'s review-stack section, or to the degraded levels, and
     states that D1 may not qualify a review-stack change.
- The `SECURITY.md` "Merge Rule" is carried into the new policy: a known security
  boundary violation remains blocking and cannot be waived by model-generated review
  confidence.
- The upstream review tool is registered in `UPSTREAMS.lock.yml` (`pstack`, role
  `dev_gate`, licence MIT, pinned commit `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701`,
  full imported path list), so `scripts/validate_upstreams.py` verifies the pin in CI —
  `UPSTREAMS_VALIDATION_PASSED sources=39`. The installed skill files are third-party
  agent instructions: the decision requires the installed file list and hashes to be
  recorded before use and forbids editing them after installation, and `.gitignore` keeps
  the install out of the tree.
- Alibaba OCR provider-backed review is now explicitly **external egress** governed by
  `SECURITY.md` "External AI and Data Egress": only the exact diff may leave the machine;
  workspace content, credentials, key material, `.env` contents, and unredacted logs may
  not; and the record must state provider identity, egress classification, and retention.
- The "risk-specific check" obligation is now defined by reference to the
  `SECURITY.md` "Mandatory Regression Matrix" and `docs/IMPLEMENTATION_PLAN.md` §21
  "Mandatory Security Qualification Matrix", so D1 and D2 compliance is auditable rather
  than assertable.
- Verified independently: no secret, credential, token, internal hostname, or local
  machine path appears anywhere in the diff; `SECURITY.md`,
  `docs/IMPLEMENTATION_PLAN.md` §21, `scripts/check_no_model.py`, and `packages/no-model`
  are untouched, so the no-model and no-unauthorized-egress rules are unaffected.

## Mechanical evidence

- Python suite: `python3 -m unittest discover -s tests` — **278 tests, OK**.
- Validators: `validate_upstreams.py` (39 sources), `validate_skills.py` (4 skills),
  `validate_agent_contract.py`, `validate_build_kit.py`, `validate_registry.py` — all pass.
- Repository hygiene: `python3 scripts/ci_hygiene.py --expected-head 419796bee74992d99864ebf022520499c7bbcd1e`
  — `CI_HYGIENE_PASSED tracked_files=1036`.
- Graft `0.21.1`: `graft build --no-gitignore --no-ignore .` exit 0; `graft check .` —
  `graph check: OK — the wiring graph is in sync with the code`;
  `graft blast --base 3156969ab52d801258af616f1556023572c2990c --format markdown` —
  "Nothing outside this diff depends on it. 0 areas changed; no indexed dependents at
  depth 2."
- **Graft coverage limitation, stated explicitly:** Graft's parsers cover JavaScript,
  Python, TypeScript, and TSX. All 21 changed files are Markdown, `.gitignore`, and
  `UPSTREAMS.lock.yml`; Graft reports them as "not in the graph — no parser claims the
  extension". The blast result therefore establishes that **no indexed implementation
  module depends on this diff**; it does not and cannot analyse the Markdown prose
  itself. The prose is covered by the four review bars above.
- TypeScript, ESLint, the Node suites, the web production build, the Lens and database
  suites, and the remaining hosted jobs are exercised by the exact-head GitHub CI run
  recorded in the governing pull request.

## Final verdict

Zero unresolved must-fix findings across correctness, parsimony, product, and
security/privacy. Zero unresolved must-fix findings in the delta re-review. The grain is
cleared for merge under the replacement review stack, with the former Jev gate recorded
as waived rather than satisfied.
