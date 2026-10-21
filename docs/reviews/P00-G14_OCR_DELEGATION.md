# P00-G14 Contributor Onboarding — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G14` — contributor onboarding and professional issue/PR intake.
- Branch: `skilit/p00-g14-contributor-hygiene`
- Canonical base SHA: `9c0cca47fd4169c9a7bd50034aa2c59f9cce014e`
- Reviewed candidate HEAD: `9790837ae5ab7493000fea55418478f068f0409a`
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from origin/main --to 9790837ae5ab7493000fea55418478f068f0409a --format json`

- `total_files`: 8
- `reviewable_count`: **3**
- `excluded_count`: 5 — four `unsupported_ext` (`.github/PULL_REQUEST_TEMPLATE.md`,
  `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SUPPORT.md`) and one `default_path`
  (`tests/test_ci_hygiene.py`)
- `total_insertions`: 351, `total_deletions`: 1

**Reviewable (3):**

| File | Status | +/- |
| --- | --- | --- |
| `.github/ISSUE_TEMPLATE/01_bug_report.yml` | added | +83 / -0 |
| `.github/ISSUE_TEMPLATE/02_feature_request.yml` | added | +65 / -0 |
| `scripts/ci_hygiene.py` | modified | +1 / -1 |

The four Markdown documents are excluded by extension and are covered by the PStack panel
in `docs/reviews/P00-G14_PSTACK_PANELS.md`.

## Resolved rules

`ocr delegate rule .github/ISSUE_TEMPLATE/01_bug_report.yml .github/ISSUE_TEMPLATE/02_feature_request.yml scripts/ci_hygiene.py` resolved:

- **Rule Group 1: system / `.github/**/*.{yaml,yml}`** — applies to the two issue forms.
  Bars: Content, Issue Template Validation, and the general configuration bars.
- **Rule Group 1: system / `**/*.{py,pyi,ipynb}`** — applies to `scripts/ci_hygiene.py`.
  Bars: Content, Obvious Typos or Spelling Errors, Dead Code, Mutable Default Arguments and
  Shared State, Boundary and Edge-Case Handling, Error Handling and Exceptions, Identity
  and Equality Comparisons, Resource Management, Performance, Concurrency and Async, and
  Security-Sensitive Code.

## Delegated review executed against the exact diff

### The two issue forms (Rule Group 1: `.github/**/*.{yaml,yml}`)

- **Issue Template Validation — missing required fields:** both forms carry `name`,
  `description` and `body`, plus `title` and `labels`. Satisfied.
- **Invalid input types:** every body item uses one of `markdown`, `input`, `textarea`,
  `dropdown`, `checkboxes`. Satisfied.
- **Empty options in dropdowns:** both dropdowns carry non-empty `options` lists, and the
  checkbox groups carry object options with `label` and `required`. Satisfied.
- **Content:** the `revision` placeholder is quoted, so the `#` in "PR #123" is not parsed
  as a YAML comment and the value is not truncated. All `id`s are unique and kebab-case.
  Neither form requests a secret, credential, private URL, customer content, or personal
  data; the evidence field requires redaction of credentials, emails, private URLs, cookies
  and workspace contents, and both forms refuse security reports and require a
  sensitive-material self-attestation before submission. The private-reporting route and
  its maintainer fallback are stated inline. No secret, credential, internal hostname,
  email address or absolute local path appears in either form.

### `scripts/ci_hygiene.py` (Rule Group 1: `**/*.{py,pyi,ipynb}`)

The diff is a single line:

```python
-FORBIDDEN_TRACKED_PARTS = {".claude", "__pycache__", "graft", "node_modules"}
+FORBIDDEN_TRACKED_PARTS = {".claude", ".ignore", "__pycache__", "graft", "node_modules"}
```

- **Content** — one path component is added to the forbidden set. The consuming check
  (`if any(part in FORBIDDEN_TRACKED_PARTS for part in rel.parts)`) rejects any tracked
  path with a `.ignore` component. No tracked path in the repository has such a
  component, so the change cannot break an existing tree.
- **Obvious Typos, Dead Code, Mutable Default Arguments and Shared State, Boundary and
  Edge-Case Handling, Error Handling and Exceptions** — inapplicable to a diff that adds
  one element to one module-level set literal: it introduces no name, no default, no
  branch, and no exception path.
- **Identity and Equality Comparisons** — no comparison is introduced or changed.
- **Resource Management** — no file, socket, lock, or connection is opened or closed.
- **Performance** — the set grows from four to five members; membership on a `set` stays
  O(1) and the check runs once per tracked path, not on a hot path.
- **Concurrency and Async** — the module is a synchronous CLI script with no shared
  mutable state and no async entry point.
- **Security-Sensitive Code** — no `eval`, `exec`, `compile`, `subprocess`, `shell=True`,
  `pickle`, `marshal`, unsafe `yaml.load`, string-built SQL, secret logging, weak
  cryptography, or unvalidated path join is introduced. The change is strictly
  strengthening: it converts a repository convention into a mechanical block on tracked
  local-environment files, closing the path that the PStack panel flagged when a blanket
  `git add -A` staged the local `.ignore` file. Regression coverage is added in
  `tests/test_ci_hygiene.py`, and the test is proven non-vacuous by removing the rule
  in memory and observing the same path being accepted.

## Findings

**Zero unresolved blocking findings.**

The four worth-considering findings in this grain were raised by the PStack panel and by
the delegated rule application above, and all four were fixed before the reviewed
candidate `9790837`. They are enumerated in `docs/reviews/P00-G14_PSTACK_PANELS.md`.

## Scope honesty

- OCR did not scan anything. It resolved the applicable rule groups and produced the
  preview; the review of the diff against those groups was performed by the host agent
  and by two independent fresh-context PStack judge sessions.
- This record must not be read as an external model scan, an OCR-provided verdict, or a
  provider-backed review.
