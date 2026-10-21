# P00-G15 Approved Wordmark System — Alibaba Open Code Review Delegation Record

**This is a delegated review. It is NOT an LLM-backed OCR scan.** No OCR provider
credential is configured on this machine, so the official `ocr delegate` workflow was used
per `GOVERNANCE.md` and the founder decision of 2026-10-21.

- Grain: `P00-G15` — apply the lowercase `skilit` wordmark and the approved colour system.
- Branch: `skilit/p00-g15-approved-wordmark-system`
- Canonical base SHA: `596abe75473112623ecf2147a12c26c3fa6a758b`
- Reviewed candidate HEAD: `c5b54b206e075e57fa6e9b181239c2030695b700`
- OCR version: `open-code-review v1.12.13 (fabbdb29) darwin/arm64`
- Provider status: **no OCR LLM provider credential configured**. Provider-backed OCR
  review was therefore not available and was not simulated.

## Exact-diff preview

`ocr delegate preview --from origin/main --to c5b54b206e075e57fa6e9b181239c2030695b700 --format json`

- `total_files`: 35
- `reviewable_count`: **18**
- `excluded_count`: 17
- `total_insertions`: 1150, `total_deletions`: 95

**Reviewable (18):** `.github/workflows/ci.yml`, `NOTICE`, `UPSTREAMS.lock.yml`,
`apps/web/app/globals.css`, `apps/web/app/login/page.tsx`, `apps/web/app/page.tsx`,
`apps/web/app/signup/page.tsx`, `apps/web/app/terms/page.tsx`,
`apps/web/components/skilit-shell.tsx`, `apps/web/tests/brand-identity.test.mjs`,
`apps/web/tests/brand-social.test.mjs`, `docs/brand/tokens.json`,
`docs/brand/wordmark-inter-tight-600.json`, `imports/inter-tight-google-fonts/manifest.json`,
`scripts/build_release_candidate.mjs`, `scripts/generate_skilit_brand.py`,
`scripts/render_skilit_social.mjs`, `scripts/smoke-brand-chrome.mjs`.

The excluded files are the Markdown and the binary brand assets, which OCR does not review.

## Resolved rules

`ocr delegate rule` resolved, for this file set:

- **system / `**/*.{yaml,yml}`** for `NOTICE`, `UPSTREAMS.lock.yml`,
  `imports/inter-tight-google-fonts/manifest.json` and the CI workflow.
- **system / `**/*.{py,pyi,ipynb}`** for `scripts/generate_skilit_brand.py` and
  `scripts/build_release_candidate.mjs`.
- **system / `**/*.{js,mjs,cjs,jsx,ts,tsx}`** for the web sources, the two brand test
  files and the two Node scripts.
- The CSS, JSON and binary assets are reviewed against the default rule group.

## Delegated review executed against the exact diff

- **CI workflow.** The two added steps are additive only: a pinned Playwright
  Chromium headless-shell install that reuses the pattern already present in the `lens`
  job, and the brand-chrome smoke. Neither introduces a secret, an unpinned action, a
  `continue-on-error`, or a skipped check, and no existing step was weakened.
- **`scripts/build_release_candidate.mjs`.** The source count is now derived from the
  lock instead of being hardcoded, which is what keeps the NOTICE tally from drifting
  silently; the release builder still fails closed on `.env`, `.pem`, `.key`,
  `credentials.json`, `secrets.json`, `id_rsa`, `id_ed25519`, `node_modules/` and
  `.ignore`.
- **`scripts/generate_skilit_brand.py` and `scripts/render_skilit_social.mjs`.** Both are
  deterministic: re-running them reproduces the committed SVG and PNG assets
  byte-for-byte. The social renderer uses a hand-rolled CRC-32 because the repository
  declares `engines.node >=20.9.0` while `zlib.crc32` needs Node 20.15 or newer.
- **`apps/web/app/globals.css`.** The new custom properties agree with
  `docs/brand/tokens.json`; the two brand panel text surfaces measure 4.764:1 and
  5.567:1 against the `#FF782D` field, at or above the WCAG AA 4.5:1 floor, and a
  regression test now asserts that from the declared value.
- **The web sources.** The changes are the lowercase wordmark, the approved palette and
  the font-face wiring. No secret, credential, absolute local path, or unexpected network
  endpoint appears. The font is served from the same origin as its licence text, and the
  licence is linked from the legal surface.
- **`UPSTREAMS.lock.yml` and the import manifest.** The font source is pinned to an
  immutable commit with an MIT-equivalent SIL OFL 1.1 licence, a full imported-path
  list, and a recorded upstream file digest. The manifest, the lock, the NOTICE and the
  wordmark record agree. A new test holds them to that agreement.
- **`NOTICE`.** The source tally now matches the lock exactly, the ready-source section
  lists the pinned review-tool source with its licence and pin, and the bundled font is
  recorded in its own section with the licence text, the notice condition, the served
  licence path, and the honest statement that the subsetting tool is not recorded.

## Findings

**Zero unresolved blocking findings.**

The one must-fix and two worth-considering findings in this grain were raised by the
PStack panel and by the delegated rule application above, and all were fixed before the
reviewed candidate `c5b54b2`. They are enumerated in
`docs/reviews/P00-G15_PSTACK_PANELS.md`.

## Scope honesty

- OCR did not scan anything. It resolved the applicable rule groups and produced the
  preview; the review of the diff against those groups was performed by the host agent
  and by three independent fresh-context PStack judge sessions.
- This record must not be read as an external model scan, an OCR-provided verdict, or a
  provider-backed review.
