# P00-G14 Contributor Onboarding — PStack Review Panel

- Grain: `P00-G14` — contributor onboarding and professional issue/PR intake.
- Branch: `skilit/p00-g14-contributor-hygiene`
- Canonical base SHA: `9c0cca47fd4169c9a7bd50034aa2c59f9cce014e` (the merge of the
  review-stack migration, PR #167)
- Reviewed candidate HEAD: `9790837ae5ab7493000fea55418478f068f0409a`
- Reviewed diff: `origin/main...9790837ae5ab7493000fea55418478f068f0409a` — 8 files, 351
  insertions, 1 deletion.
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.2: the combined judge answers **all four bars**,
  including security and privacy, on every grain, and the manifest records the base and
  candidate SHAs.
- Judges: **one independent fresh-context panel session** covering all four bars over the
  candidate `84224ca`, plus **one independent fresh-context delta re-review** over the
  fixes `84224ca..9790837` and the final candidate. No judge authored the diff.
- Degraded level: **none**.

## Panel manifest

```
panel: full — correctness ✓ (fresh-context judge) · parsimony ✓ (fresh-context judge) ·
product ✓ (fresh-context judge) · security ✓ (fresh-context judge) ·
deltas: one independent fresh-context delta re-review ✓ ·
base 9c0cca47fd4169c9a7bd50034aa2c59f9cce014e · reviewed candidate 9790837ae5ab7493000fea55418478f068f0409a ·
merge candidate: the commit carrying this record
```

The merge candidate differs from the reviewed candidate `9790837` only by this record and
`docs/reviews/P00-G14_OCR_DELEGATION.md`, both Markdown: they are excluded from Alibaba
OCR's reviewable set and are not indexed by Graft, so neither changes the review outcome
or the applicability evidence below.

## Initial panel — `84224ca` — all four bars PASS, zero must-fix

The panel returned `correctness=PASS parsimony=PASS product=PASS security=PASS ·
MUST-FIX=0 WORTH=4 SKIP=1`. The four worth-considering findings were fixed in
`9790837`:

1. Three guides pointed at `SECURITY.md` as the vulnerability-reporting route, but
   `SECURITY.md` is a product security charter with no reporting procedure — fixed: the
   three references now name the security constraints there, and each guide keeps its own
   self-contained private-reporting instruction.
2. Two public contributor documents told readers to preserve `.ignore`, a maintainer-local
   untracked file that exists in no clone — fixed: the instruction now says "untracked
   files".
3. The contributor guide pointed at `docs/operations/CI.md` for the required hosted checks,
   but that document's job list is a subset of the workflow's fourteen jobs — fixed: the
   CI workflow is now named as the authoritative list.
4. The pull-request template had no field for the ruleset identifier and required-check
   list, which the review-stack decision requires in every pull-request body — fixed: the
   template now has that field.

The panel's one skip finding was that commit `39f3e52` in this branch had staged the local
`.ignore` file and twelve pnpm `node_modules` symlinks. Commit `84224ca` removed them from
the index without rewriting history, and `9790837` makes the rule permanent by listing
`.ignore` among the forbidden tracked path parts in `scripts/ci_hygiene.py`, with a
non-vacuous regression test. The disclosure is also recorded in the pull-request body.

## Delta re-review — `84224ca..9790837` — all four bars PASS, zero must-fix

The delta re-review returned `correctness=PASS parsimony=PASS product=PASS security=PASS ·
MUST-FIX=0 WORTH=0 SKIP=1` over the final candidate, and independently re-verified all
four fixes, the non-vacuity of the new hygiene test, the branch's tracking state, and the
local gate.

## Correctness — PASS

- All 37 relative Markdown links in the six new documents resolve.
- Both issue forms are valid GitHub issue forms: valid YAML, `name`/`description`/
  `title`/`labels`/`body` present, all fifteen body items use valid issue-form types
  (`markdown`, `input`, `textarea`, `dropdown`, `checkboxes`), all `id`s unique and
  kebab-case, dropdowns carry non-empty `options`, checkbox options carry `label` and
  `required`, and the `revision` placeholder is not truncated by a `#`.
- Every command in the contributor guide exists and is the command CI runs: the three
  `pnpm --dir apps/web` scripts, the root `pnpm test`, the Python suite, and all five
  repository validators are actual steps in `.github/workflows/ci.yml`.
- The toolchain claims match the repository: `packageManager: pnpm@9.12.0`, CI Node
  `22.23.1`, CI Python `3.12.14`, and no Python floor is declared anywhere, so none is
  claimed.
- The pull-request template asks for exactly the four gates the current governance
  requires — the PStack panel with all four bars and the degraded-level recording, Alibaba
  OCR applicability and delegation, Graft build/check and blast, and exact-head CI — and
  asks for no gate that was removed. No `Jev`, `TypeSafe`, `CodeRabbit`, `Cubic` or `Qodo`
  reference survives in the six new files.
- The code of conduct's "open-source" claim matches the repository's Apache-2.0 licence,
  and its English-only statement matches the governance language rule. No contact channel,
  SLA, or moderation promise is invented.

## Parsimony — PASS

- 351 lines across eight files, each artifact self-contained and cross-linking rather than
  restating. No new process, abstraction, or scaffolding was introduced.
- The issue forms carry only the fields that gate triage. The pull-request template's
  "mark `N/A` with a reason and `BLOCKED` a blocked check, never as PASS" convention stops
  contributors from fabricating results.
- The permanent `.ignore` guard is one member added to an existing set plus one test that
  mirrors the existing `.claude` guard.

## Product completeness and specification alignment — PASS

- The grain's objective is contributor onboarding and professional issue/PR intake. All six
  specified artifacts are present and non-trivial (83, 65, 49, 35, 79 and 29 lines), and
  each carries its own substance: the bug form captures revision, environment, reproduction,
  expected behaviour and evidence; the feature form captures the problem, behaviour,
  acceptance criteria and alternatives; the pull-request template carries every field
  `GOVERNANCE.md` "Pull Requests" requires plus a per-gate evidence slot.
- Nothing present is outside the grain, apart from the pull-request template's merge and
  release boundary checklist, which the governance requires of every pull request.

## Security and privacy — PASS

- No secret, credential, token, email address, internal hostname, absolute local path, or
  URL of any kind appears in the six new documents. Every match on a sensitive term is a
  prohibition, not a request.
- Neither form asks for a secret, credential, private URL, customer content, or personal
  data. The evidence field explicitly requires redaction of credentials, emails, private
  URLs, cookies and workspace contents.
- A private-reporting route with a maintainer fallback exists in all four relevant
  artifacts, and the bug form refuses security reports outright.
- The change reduces risk: `.ignore` becomes unstakeable by CI while remaining byte-
  identical on disk, and no tracked path in the tree has a `.ignore` component, so the
  guard cannot produce a false failure.

## Mechanical evidence

- Python suite: `TZ=UTC python3 -m unittest discover -s tests` — **280 tests, OK**.
- Validators: `validate_upstreams.py` (39 sources), `validate_skills.py` (4 skills),
  `validate_agent_contract.py`, `validate_build_kit.py`, `validate_registry.py` — all pass.
- Repository hygiene: `python3 scripts/ci_hygiene.py --expected-head 9790837ae5ab7493000fea55418478f068f0409a`
  — `CI_HYGIENE_PASSED tracked_files=1044`.
- Graft `0.21.1`: `graft build --no-gitignore --no-ignore .` exit 0; `graft check .` —
  `graph check: OK — the wiring graph is in sync with the code`;
  `graft blast --base origin/main --format markdown` — "**Nothing outside this diff depends
  on it.** 1 area changed; no indexed dependents at depth 2", the single area being
  `ci_hygiene.py` with "no function, method or class changed here". 6 of the 8 changed
  files are not in the graph.
- **Graft coverage limitation, stated explicitly:** Graft's parsers cover JavaScript,
  Python, TypeScript and TSX. The changed implementation file is Python
  (`scripts/ci_hygiene.py`); the other seven changed files are Markdown and YAML issue
  forms, and Graft reports the Markdown as "not in the graph — no parser claims the
  extension". The blast result establishes that **no indexed implementation module depends
  on this diff**; it does not analyse the issue-form YAML or the prose. Those are covered
  by the four review bars above and by the Alibaba OCR record.
- The GitHub Actions run for the exact candidate is recorded in the governing pull request.

## Verdict

Zero must-fix findings in the initial panel and zero in the delta re-review. All four
worth-considering findings from the initial panel are fixed and independently re-verified.
The grain is cleared for merge under the replacement review stack.
