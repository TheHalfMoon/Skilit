# P00-G15 Approved Wordmark System — PStack Review Panel

- Grain: `P00-G15` — apply the lowercase `skilit` wordmark and the approved colour system.
- Branch: `skilit/p00-g15-approved-wordmark-system`
- Canonical base SHA: `596abe75473112623ecf2147a12c26c3fa6a758b` (the merge of the contributor
  documentation grain, PR #162)
- Reviewed candidate HEAD: `c5b54b206e075e57fa6e9b181239c2030695b700`
- Reviewed diff: `origin/main...c5b54b206e075e57fa6e9b181239c2030695b700` — 35 files, 1150
  insertions, 95 deletions.
- Mechanism: upstream PStack `ps-review` workflow from
  `https://github.com/phthomas/pstack`, pinned at commit
  `faa4e9fb22e5cd19ac85ca094f6056ba89eaa701` (v2.3.1, MIT). The panel was run with the
  Skilit composition in decision §3.1–§3.2: the combined judge answers **all four bars**,
  including security and privacy, on every grain, and the manifest records the base and
  candidate SHAs.
- Judges: **one independent fresh-context panel session** over the candidate `a80f76a`,
  plus **two independent fresh-context delta re-reviews** over `a80f76a..a3c9bc5` and
  `a3c9bc5..c5b54b2`. No judge authored the diff.
- Degraded level: **none**.

## Panel manifest

```
panel: full — correctness ✓ (fresh-context judge) · parsimony ✓ (fresh-context judge) ·
product ✓ (fresh-context judge) · security ✓ (fresh-context judge) ·
deltas: two independent fresh-context delta re-reviews ✓ ·
base 596abe75473112623ecf2147a12c26c3fa6a758b · reviewed candidate c5b54b206e075e57fa6e9b181239c2030695b700 ·
merge candidate: the commit carrying this record
```

The merge candidate differs from the reviewed candidate `c5b54b2` only by this record and
`docs/reviews/P00-G15_OCR_DELEGATION.md`, plus one documentation row in
`docs/brand/IDENTITY.md` that adds the pre-existing `border` token to the palette table.
All three are Markdown: they are excluded from Alibaba OCR's reviewable set and are not
indexed by Graft, so none changes the review outcome or the applicability evidence below.

## Initial panel — `a80f76a` — one must-fix, two worth-considering

The panel returned `correctness=FAIL parsimony=PASS product=PASS security=PASS ·
MUST-FIX=1 WORTH=2 SKIP=4`.

- **MUST-FIX — contrast.** The approved orange field is `#FF782D`, and the brand panel's
  lower text was still `#553727`, which measures 4.065:1 on that field and so falls below
  the WCAG AA 4.5:1 floor that this branch's own brand principles require. The base
  colour `#F3A07C` gave 5.163:1. Fixed: the text colour is now `#42301F` at 4.764:1, both
  panel text colours are recorded as brand tokens, and a regression test asserts the
  contrast of both surfaces against the field.
- **WORTH — no import audit test.** The font import manifest had no test, unlike the
  repository's other two import manifests, so its licence-critical claims were asserted
  nowhere. Fixed: `tests/test_inter_tight_import.py` now holds the manifest to the
  upstream lock on pin, licence, state and imported paths, checks that every imported path
  exists, checks the bundled subset and licence copies against their recorded digests,
  checks that the licence text carries the upstream copyright notice and no Reserved Font
  Name, and checks that the unrecorded-subsetting-tool disclosure is present in the
  manifest, the wordmark record and the NOTICE.
- **WORTH — unrecorded subsetting tool.** The upstream-TTF-to-WOFF2 derivation is asserted
  by digest because the subsetting tool and its version were not recorded. No tool was
  invented. The limitation is now carried in the wordmark asset record as well as the
  manifest and the NOTICE, and the new test fails if the disclosure is dropped from any of
  the three.

The panel's four skips were also closed: the identity palette table now lists the
panel-text colours and the pre-existing border token with their measured ratios, the
licence-copy constants are named for the copy they point at, and the contrast test
computes from the value the stylesheet actually declares while asserting that value
equals the recorded token.

## Delta re-reviews — `a80f76a..a3c9bc5` and `a3c9bc5..c5b54b2` — all four bars PASS

The first delta re-review returned `correctness=PASS parsimony=PASS product=PASS
security=PASS · MUST-FIX=0 WORTH=0 SKIP=3` and independently re-verified both contrast
values, the non-vacuity of the new contrast test and the new import test, and that the
brand generators still reproduce the committed assets byte-for-byte. The second returned
`correctness=PASS parsimony=PASS product=PASS security=PASS · MUST-FIX=0 WORTH=0 SKIP=0`.

## Correctness — PASS

- The upstream commit `fac60545cc0de9d4eff6eb5b1ab88bcdfc9ecc69` and both upstream
  SHA-256 values were independently reproduced by fetching `google/fonts` at that commit.
- The bundled WOFF2 hashes to `51ac2848f60a116172f263c7b9d15cd816cbf14fdb134584b6e15852664b5d9a`,
  matching the recorded `subsetSha256`; the public licence copy hashes to
  `73aeb48eba2c48bb73c2b5a1718df9e0968b7f1f1f7bfd8e02cbd748766dd921`, matching
  `sourceLicenseSha256` and the documentation copy.
- The upstream name table carries family `Inter Tight` and the copyright notice
  "Copyright 2022 The Inter Project Authors" with **no "with Reserved Font Name" clause**,
  which is what supports the OFL rename claim in the NOTICE.
- Both generators are deterministic: `python3 scripts/generate_skilit_brand.py` and
  `node scripts/render_skilit_social.mjs` reproduce the committed SVG and PNG assets
  byte-for-byte, confirmed by hashing before and after a re-run.
- The manifest, the upstream lock, the NOTICE and the wordmark record agree on the pin,
  the licence and the imported paths.
- The contrast of both brand panel text surfaces against the field, recomputed with the
  WCAG relative-luminance formula: `#42301F` on `#FF782D` is 4.764:1, `#35251C` on
  `#FF782D` is 5.567:1, both at or above the AA 4.5:1 floor.
- The added CI steps are pinned, additive, non-secret, and weaken no existing check: the
  Playwright Chromium headless-shell install reuses the pattern already in the `lens` job,
  and the brand-chrome smoke is bounded to localhost, writes nothing outside the worktree,
  and fails the run on any unexpected failed resource.

## Parsimony — PASS

- Every added file is load-bearing: two generators, the provenance manifest, the lock
  entry, the NOTICE section, two licence copies, the brand JSON, two test files, one CI
  smoke, and the tally derivation in the release builder.
- The hand-rolled CRC-32 in the social renderer is justified: the repository declares
  `engines.node >=20.9.0` and `zlib.crc32` needs Node 20.15 or newer.
- The fixes the panel required are proportionate: two tokens, one focused JavaScript
  test, one focused Python module, and one disclosure field.

## Product completeness and specification alignment — PASS

- All seven approved criteria are implemented and verified: the lowercase `skilit`
  wordmark across the sidebar, the auth pages, the home panel, the lockups, the social
  images, the tokens, the README title and the app icon; the continuous orange/black S as
  one 45-point outline with identical geometry asserted across every mark, lockup and
  social image; Inter Tight typography served from a local subset; offline pinned assets
  on the same origin; SIL OFL licensing with the text served beside the font and linked
  from the legal surface; regenerated SVG and PNG assets; responsive layout at the 760px
  breakpoint; and brand regression tests.

## Security and privacy — PASS

- No secret, credential, token, absolute local path, or unexpected network endpoint is
  introduced. The only added egress is the Playwright browser download, which reuses the
  repository's existing pinned pattern.
- The font ships with its licence text at the same origin and the licence is linked from
  the legal terms surface, satisfying the OFL condition that the notice travels with the
  font. Chromium inspection confirmed the local WOFF2 loads with no Google Fonts request.
- The brand-chrome smoke's failure allowlist is scoped to two exact paths with exact
  statuses; every other failed resource fails the run.

## Mechanical evidence

- Python suite: `TZ=UTC python3 -m unittest discover -s tests` — **288 tests, OK**.
- Web brand suites: `node --experimental-strip-types --test apps/web/tests/brand-identity.test.mjs
  apps/web/tests/brand-social.test.mjs` — **12 tests, 12 pass, 0 fail**.
- `pnpm --dir apps/web lint` — clean. `pnpm --dir apps/web typecheck` — clean.
- Validators: `validate_upstreams.py` (40 sources), `validate_skills.py` (4 skills),
  `validate_agent_contract.py`, `validate_build_kit.py`, `validate_registry.py` — all pass.
- Repository hygiene: `python3 scripts/ci_hygiene.py --expected-head c5b54b206e075e57fa6e9b181239c2030695b700`
  — `CI_HYGIENE_PASSED tracked_files=1053`.
- Graft `0.21.1`: `graft build --no-gitignore --no-ignore .` exit 0; `graft check .` —
  `graph check: OK — the wiring graph is in sync with the code`;
  `graft blast --base origin/main --format markdown` — "**Nothing outside this diff depends
  on it.** 5 areas changed; no indexed dependents at depth 2", the areas being `Home`,
  `SignupPage`, `SkilitShell`, `Terms` and the `check` helper, with 22 of the 35 changed
  files outside the graph.
- **Graft coverage limitation, stated explicitly:** Graft's parsers cover JavaScript,
  Python, TypeScript and TSX. The changed code is CSS, a stylesheet, test files, brand
  JSON, Markdown, YAML and a pinned font binary; Graft reports the non-code files as "not
  in the graph — no parser claims the extension". The blast result establishes the
  dependency picture for the indexed code and names the affected areas; it does not
  analyse the CSS, the JSON, the issue-form YAML or the prose. Those are covered by the
  four review bars above, by the brand regression suites, and by the real Chromium
  brand-chrome smoke that CI now runs.
- The exact-head GitHub Actions run for this candidate is recorded in the governing pull
  request.

## Verdict

One must-fix and two worth-considering findings from the initial panel; zero must-fix and
zero worth-considering findings from the two delta re-reviews. Every finding is fixed and
independently re-verified. The grain is cleared for merge under the replacement review
stack.
