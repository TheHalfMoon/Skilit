# P10-G33 — Research screen selection to actor-scoped evidence comparison

**Status: Draft / no merge, tag, deploy, release or paid resources.**

## Gap and scope

P10-G24/G31/G32 established protected local research search, explicit approved
image preview, and operator-only local admission. However an actual user had to
copy two opaque IDs into a separate Compare page. G33 adds a direct
research-result-to-comparison workflow with *no new server endpoint*,
new third-party API, image download, remote inference or database schema.

- The Research page offers accessible per-screen selection (maximum two),
  compare, and clear-selection actions. Selections are transient React state
  and reset on new searches or editing a query, but remain across pagination.
- Client-generated GET uses the existing same-origin, cookie-authenticated
  `/api/v1/assets/compare` endpoint and accepts two valid distinct UUIDs.
- The server rechecks the current actor's authorization and rights for **both**
  artifacts. A previously readable search result is never treated as a
  permanent permission token.
- Response parser rejects non-screen results, reversed or mismatched artifacts,
  malformed responses and unavailable/denied results. It does not preserve a
  stale comparison on a selection or search change.
- Comparison is limited to **recorded metadata** (fields, tags, lexical
  Jaccard terms); it is not visual or semantic similarity and never copies
  screenshot bytes into this workflow.
- IDs remain out of the page navigation URL, local/session storage and tokens.

## Reproducible evidence

1. Pure selectors and API response parser are covered in
   `apps/web/tests/research-compare-ui.test.mjs`.
2. Real ephemeral PGlite test `research-compare-real-db.test.mjs` executes
   private-workspace screen search -> UI-derived pair -> original REST compare,
   with a distinct outsider who gets neither searchable metadata nor comparison.
3. `scripts/smoke-research-search.mjs` runs a built Next.js app in real
   Playwright Chromium at 390, 768 and 1440 px. Synthetic intercepted REST
   returns two screen cards, users select two, compare them, see a field diff,
   edit the query (which clears the comparison), and confirm denied search
   does not expose prior metadata. This is an actual browser journey, not a
   production licensed screenshot corpus.
4. Ingest, image preview and existing compare packages are **not changed**;
   Web lint, strict TypeScript, Node tests, Next build and CI exact-HEAD checks
   remain required before qualification.

## Non-goals / open gates

No image similarity, capture crawler, batch licensed corpus, browsing by
product/flow, competitive scores, review-waiver, public deployment or release.
Known code scanning baseline and G32 path alerts remain in issue #180 and
PR #185. Automated CodeQL success is not zero security findings. Independent
fresh-context PStack four-bar security review and rights-reviewed real-world
screen corpus qualification are still required.

**Keep Draft and main unchanged.** If integrated from this PR, do not also
merge overlapping PR #185 or its prior source stack separately.
