# skilit — brand and product interface system

This is the source-controlled identity for the Skilit development UI. The
founder-approved single-stroke **S** shape is reconstructed as editable vector
geometry, not embedded as a screenshot. Only one Skilit product identity
is used in the active UI.

## Core marks and correct usage

| Artifact | Use |
| --- | --- |
| `apps/web/public/brand/skilit-mark-orange.svg` | Orange mark on warm off-white or dark surfaces |
| `apps/web/public/brand/skilit-mark-black.svg` | Black mark on the warm orange brand field |
| `apps/web/public/brand/skilit-lockup-light.svg` | Lowercase `skilit` wordmark on cream |
| `apps/web/public/brand/skilit-lockup-orange.svg` | Lowercase `skilit` wordmark on warm orange |
| `apps/web/app/icon.svg` | Standalone orange S on cream app/favicon canvas |
| `apps/web/public/brand/skilit-social-light.svg` | Editable 1200×630 social/repository composition on cream |
| `apps/web/public/brand/skilit-social-orange.svg` | Editable reverse composition on warm orange |
| `apps/web/public/brand/skilit-social-light.png` | Open Graph and default web card (1200×630) |
| `apps/web/public/brand/skilit-social-orange.png` | Alternate social and GitHub preview (1200×630) |

The entire identity can be regenerated with
`python3 scripts/generate_skilit_brand.py`. The S uses one continuous,
unbroken silhouette with no shadows, outlines, glow, highlights, or gradients.
Do not stretch or rotate the symbol. Leave generous clear space around it.


The visible brand wordmark is always **`skilit`** in lowercase, matching the
founder-approved identity image. Conventional **Skilit** capitalization remains
valid in prose, accessibility labels, package metadata, and compatibility
contracts. No first-party wordmark uses an initial capital or trailing dot.

The two social compositions use the *same* generated S path and the same
ink and orange palette as the existing lockups. No alteration to the approved
S silhouette is permitted without founder approval.

## Regeneration and publishing boundaries

From a frozen, fully installed checkout with pinned Chromium headless shell:

```sh
python3 scripts/generate_skilit_brand.py
node scripts/render_skilit_social.mjs
node --experimental-strip-types --test apps/web/tests/brand-identity.test.mjs apps/web/tests/brand-social.test.mjs
```

The renderer reuses `playwright-core` already pinned by the Lens package and
makes **no network requests**. Generated PNGs are checked into Git so normal
runtime/build and link-preview requests don't require Chromium.

Next.js uses `skilit-social-light.png` for Open Graph and Twitter cards. The
metadata origin defaults to `http://localhost:3000` for local development;
a deliberately internet-facing installation must explicitly set
`SKILIT_METADATA_ORIGIN=https://its-actual-hostname.example` **at build time**
before publishing a link, otherwise third-party preview crawlers cannot
retrieve images from localhost. The example hostname is explanatory only and
not a Skilit deployment target.

GitHub's repository social preview is a **repository Settings** control, not
something README or metadata can update automatically. An authorized operator
can manually upload `skilit-social-light.png` or
`skilit-social-orange.png` in Settings → General → Social preview. These
assets being committed do *not* imply that the GitHub preview has been set.

**Source/raster sync:** whenever the SVG social compositions change, run the
Chromium renderer and commit *both* regenerated PNG previews in the same
qualified change. Do not merge a source-only change with stale raster previews.

No release tags, signed artifacts, deployment, or public announcement are
affected by regenerating or updating the branding source.

## Palette (single canonical system)

| Token | Hex | Role |
| --- | --- | --- |
| Orange mark | `#FF6A1F` | Founder-approved Skilit orange on cream |
| Orange field | `#FF782D` | Reverse-logo background, legible with dark lettering |
| Ink | `#0F0F0F` | Reverse mark, text, high contrast |
| Cream | `#FAF8F5` | Primary mark background |
| Workspace surface | `#F7F6F3` | Main workspace background |
| Sidebar | `#191B1E` | Deep charcoal navigation |

`apps/web/app/globals.css` owns the display tokens; keep it synchronized
with `docs/brand/tokens.json`. Workflow icon tints are deliberately secondary,
not alternative brand colors. Use the orange accent sparingly.

## Typography and responsive behavior

- The lowercase wordmark is now drawn from **Inter Tight 600** at a pinned source
  commit, with fixed SVG outlines in both official lockups and social previews;
  rendering does not depend on installed system fonts or network requests.
- The sidebar wordmark uses a tiny local Latin WOFF2 subset
  (`apps/web/public/brand/inter-tight-latin-600.woff2`) with system fallback.
  This is a locally hosted asset, not a Google Fonts web request.
- `docs/brand/wordmark-inter-tight-600.json` records the original immutable
  `google/fonts` commit and SHA-256 hashes, 600 weight, tracking and path data.
  SIL OFL 1.1 and copyright are preserved (trailing spaces normalized) at
  `docs/brand/licenses/Inter-Tight-OFL.txt`, and the same licence text is
  served to users at `apps/web/public/brand/Inter-Tight-OFL.txt` and linked
  from the legal terms surface, so a deployment carries the notice with the
  font it serves. The upstream is also pinned in
  `UPSTREAMS.lock.yml`. The generated outline is a font derivative and remains
  governed by the original font license. Trademarks are not transferred.
- Both social PNGs are regenerated by `node scripts/render_skilit_social.mjs`
  and carry the SHA-256 of their corresponding SVG. The Node contract test
  verifies the hash to catch stale previews (not a pixel-level attestation).
- The actual visual wordmark must be lowercase in logo assets and web chrome.
- Large, balanced editorial headlines and smaller legible UI labels.
- Sidebar layout on desktop; horizontal, scrollable navigation on mobile.
- Real workflow links and real service-health endpoint. No fabricated product
  usage metrics, fake authentication state, or non-functional buttons.
- Keyboard focus remains visible; reduced-motion preference is respected.

## Skilit-owned interface iconset

The app uses `apps/web/registry/skilit-ui-icons.json`, an Iconify-compatible
collection of 18 first-party geometric SVG glyphs. It follows Skilit's existing
source implementation `packages/assets/src/iconset.ts` rather than relying on
a new network dependency or third-party commercial icon library.

- Regenerate using `python3 scripts/generate_skilit_icons.py`.
- Validate the SVG bodies through the same `assertSafeSvgBody` gate used by
  the Skilit asset importer.
- React renders only predefined SVG `<path d>` data: never inject arbitrary
  or remotely supplied HTML into the DOM.
- Icon names correspond to actual Skilit product workflows.
- Keep author/source metadata in the source registry, not in customer-facing
  product icon labels.

## Boundaries

Brand/design work does **not** change authentication, persisted identities,
database schemas, REST/MCP/SDK contracts, or the signed historic pre-release.
This is development-only work: no Git tag, no public deployment, no release.

Before adopting changes, run TS, lint, Node UI contracts, production build,
Playwright desktop/mobile navigation, accessibility checks, and exact-head
GitHub CI. Functional workflow pages are preserved; new styling must not
change their behavior or unauthorized-access boundaries.
