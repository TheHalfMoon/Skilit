# P00-G17 Review Stack Migration — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G17` — replace the metered TypeSafe Jev merge gate with the zero-cost
  review stack.
- Branch: `skilit/p00-g17-governance-review-stack`
- Canonical base SHA: `3156969ab52d801258af616f1556023572c2990c`
- Reviewed candidate HEAD: `419796bee74992d99864ebf022520499c7bbcd1e`
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from 3156969ab52d801258af616f1556023572c2990c --to 419796bee74992d99864ebf022520499c7bbcd1e --format json`

- `total_files`: 21
- `reviewable_count`: **2**
- `excluded_count`: 19, every excluded file with `exclude_reason: unsupported_ext`
- `total_insertions`: 414, `total_deletions`: 35

**Reviewable (2):**

| File | Status | +/- |
| --- | --- | --- |
| `.gitignore` | modified | +4 / -0 |
| `UPSTREAMS.lock.yml` | modified | +38 / -0 |

**Excluded (19):** every Markdown file in the diff (`CODE_PROVENANCE.md`,
`GOVERNANCE.md`, `README.md`, `docs/IMPLEMENTATION_PLAN.md`, the two `docs/architecture/`
files, the new decision document, the two `docs/operations/` files, the two
`docs/provenance/` files, the seven `docs/qualification/` files, and
`docs/research/DONOR_REUSE_DECISIONS_2026-10-08.md`) — `unsupported_ext`.

The Markdown files are covered by the PStack panel in
`docs/reviews/P00-G17_PSTACK_PANELS.md`. This record covers the two reviewable files.

## Resolved rules

`ocr delegate rule .gitignore UPSTREAMS.lock.yml` resolved two rule groups:

- **Rule Group 1: system / default** — applies to `.gitignore`. Bars: Content,
  Correctness, Security, Performance, Maintainability, Test Coverage.
- **Rule Group 2: system / `**/*.{yaml,yml}`** — applies to `UPSTREAMS.lock.yml`. Bar:
  Content — check for spelling errors in YAML keys within YAML files; ignore the content
  of YAML values.

## Delegated review executed against the exact diff

### `.gitignore` (Rule Group 1: system / default)

The diff adds one ignore rule and its comment:

```
+# Review-tool skill cache - installed at review time from the pinned upstream
+# commit recorded in UPSTREAMS.lock.yml; never vendored, never committed.
+/.claude/skills/
```

- **Content** — the rule and its comment state the same thing: the review-tool skill
  install is a local cache, not a vendored dependency.
- **Correctness** — `/.claude/skills/` is root-anchored, so it matches the install
  destination `.claude/skills/` created by the decision record's install command and
  nothing else. It does not shadow any other directory. The upstream clone is created
  outside the worktree (`${TMPDIR:-/tmp}/pstack`), so no second ignore rule is needed.
- **Security** — the rule keeps third-party agent instructions out of the tracked tree,
  which is the supply-chain concern the rule exists to close. It is now enforced
  mechanically rather than by convention: `scripts/ci_hygiene.py` lists `.claude` in
  `FORBIDDEN_TRACKED_PARTS`, so any tracked path under a `.claude` directory fails the
  `bootstrap` hygiene gate, with regression coverage in
  `tests/test_ci_hygiene.py::CIHygieneTests::test_review_tool_skill_install_fails`.
  Verified that the test is not vacuous: with `.claude` removed from the forbidden set the
  same path is accepted, and with the rule present it is rejected.
- **Performance** — an ignore rule has no runtime cost.
- **Maintainability** — matches the file's existing comment style; the comment states the
  regeneration procedure and the provenance record, as the neighbouring `graft` rule does.
- **Test Coverage** — covered by the new hygiene regression test above.

### `UPSTREAMS.lock.yml` (Rule Group 2: system / `**/*.{yaml,yml}`)

The diff is purely additive: **38 insertions, 0 deletions**, one new `sources` entry.

- **Content (YAML key spelling)** — every key in the new entry is spelled exactly as in
  the other 38 entries: `id`, `source_url`, `source_kind`, `role`, `status`,
  `capability`, `permission_basis` (`type`, `note`), `license`, `pin_policy`,
  `exact_commit_or_release`, `verification_date`, `rights_scope` (`code`, `data`,
  `assets`, `models`, `services`, `trademarks`), `imported_paths`, `modifications`. No key
  spelling error. The entry's *values* are out of scope for this rule group.
- The entry's schema conformance is machine-checked independently:
  `python3 scripts/validate_upstreams.py` → `UPSTREAMS_VALIDATION_PASSED sources=39`,
  and `tests/test_validate_upstreams.py` covers the validator itself.
- The pin is `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701`, the immutable upstream commit
  of the MIT-licensed `phthomas/pstack` at v2.3.1, verified to exist and to contain
  `.claude/skills/ps-review`. `imported_paths` lists all eleven `ps-*` skill
  directories the install command copies.

## Findings

**Zero unresolved blocking findings.**

The defects found in this diff were found by the PStack panel (four independent
fresh-context judges plus five delta re-reviews) and by the delegated rule application
above. All were fixed before the merge candidate. They are enumerated in
`docs/reviews/P00-G17_PSTACK_PANELS.md`.

## Final-candidate section (preview run against candidate `8c08246`)

The merge candidate adds two governed code/configuration files to the reviewed candidate's
diff, so the applicability evidence is recorded here for the merge candidate as well.

`ocr delegate preview --from 3156969ab52d801258af616f1556023572c2990c --to 8c082465dec4a8fda0ed77526587d500fb0f19c5 --format json`

- `total_files`: 25
- `reviewable_count`: **3**
- `excluded_count`: 22 — 21 files with `exclude_reason: unsupported_ext` (every Markdown
  file in the diff) and one, `tests/test_ci_hygiene.py` (+10/-0), with
  `exclude_reason: default_path`
- `total_insertions`: 776, `total_deletions`: 36

These totals are bound to candidate `8c08246`. The merge candidate that follows it adds
only **excluded** files — the two evidence-record files and the AF-12 matrix amendment
(all Markdown, therefore excluded) — so its `total_insertions`/`total_deletions` move
while its **applicability does not**: re-running the preview against the merge candidate
yields the same three reviewable files with the same per-file changes, the same
`reviewable_count = 3`, the same `excluded_count = 22` with the same 21
`unsupported_ext` plus one `default_path`, and the same resolved rule groups. The
reviewable set and the rule groups are what this record governs; the line totals are
reported here for the named candidate they were measured on.

**Reviewable (3):** `.gitignore` (+4/-0), `UPSTREAMS.lock.yml` (+38/-0),
`scripts/ci_hygiene.py` (+1/-1).

`ocr delegate rule scripts/ci_hygiene.py` resolved **Rule Group 1: system /
`**/*.{py,pyi,ipynb}`**. The group has eleven bars: Content (favour precision over
recall; treat security and correctness findings as blocking), Obvious Typos, Dead Code,
Mutable Default Arguments and Shared State, Identity and Equality Comparisons, Boundary
and Edge-Case Handling, Resource Management, Performance, Concurrency and Async,
Error Handling and Exceptions, and Security-Sensitive Code. Six of the eleven apply
materially to a single set-literal addition — Content, Identity and Equality Comparisons,
Resource Management, Performance, Concurrency and Async, and Security-Sensitive Code, and
each is addressed below. The remaining five (Obvious Typos, Dead Code, Mutable Default
Arguments and Shared State, Boundary and Edge-Case Handling, Error Handling and
Exceptions) are inapplicable to a diff that adds one element to one module-level set
literal and introduces no name, no default, no branch, and no exception path.

### Delegated review of `scripts/ci_hygiene.py`

The diff is a single line:

```python
-FORBIDDEN_TRACKED_PARTS = {"__pycache__", "graft", "node_modules"}
+FORBIDDEN_TRACKED_PARTS = {".claude", "__pycache__", "graft", "node_modules"}
```

- **Content** — one path component is added to the forbidden set. The check that consumes
  it (`if any(part in FORBIDDEN_TRACKED_PARTS for part in rel.parts)`) rejects any
  tracked path with a `.claude` component. No tracked path in the repository has such a
  component, so the change cannot break an existing tree.
- **Identity and equality comparisons** — no comparison is introduced or changed.
- **Resource management** — no file, socket, lock, or connection is opened or closed.
- **Performance** — the set grows from three to four members; membership on a `set` stays
  O(1) and the check runs once per tracked path, not on a hot path.
- **Concurrency and async** — the module is a synchronous CLI script with no shared
  mutable state and no async entry point.
- **Security-sensitive code** — no `eval`, `exec`, `compile`, `subprocess`, `shell=True`,
  `pickle`, `marshal`, unsafe `yaml.load`, string-built SQL, secret logging, weak
  cryptography, or unvalidated path join is introduced. The change is strictly
  *strengthening*: it converts the `.gitignore` convention into a mechanical block on
  tracked third-party agent instructions, closing the supply-chain path the security judge
  identified. Regression coverage is added in `tests/test_ci_hygiene.py`, and the test is
  proven non-vacuous.

## Scope honesty

- OCR did not scan anything. It resolved the applicable rule groups and produced the
  preview; the review of the diff against those groups was performed by the host agent
  and by four independent fresh-context PStack judges.
- This record must not be read as an external model scan, an OCR-provided verdict, or a
  provider-backed review.
