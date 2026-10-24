# P10-G24 — Search for research screens through existing REST and MCP

**Status:** implementation candidate; not a public release and not proof of competitor parity.

The `search_assets` MCP tool and `GET /api/v1/assets` support an **explicit** `kinds=["screen"]` (MCP) or `kinds=screen` (REST) filter. With this filter, the existing deterministic PostgreSQL lexical search can locate actor-readable research screen records already imported by the Skilit corpus path.

The **/research** page makes this capability accessible from the Skilit navigation. It provides a labeled search form, a responsive screen-metadata list, a clear serving/rights notice, an accessible error state, and cursor-based "Load more screens". The page reuses `sessionRequest` and does not fetch images or send tokens in query strings.

**Backward compatibility:** omitted `kinds` still means icons, logos, fonts; `registerAsset` continues to accept *only* those three registry kinds. This feature adds no new MCP tool, API endpoint, schema migration, external embedding service, or paid model. Screen search and `get_asset` yield *metadata only* unless the normal serving policy independently authorizes bytes. This grain does not add or redistribute image bytes.

## Privacy and rights boundary

- Global screen rows must be marked `public` before they can appear. A legacy, non-public, workspace-less screen row is not searchable or resolvable merely because its `workspace_id` is null.
- Workspace-bound screens are visible to authorized members, with private screens restricted to their owner, consistently with `getArtifactForActor`. SQL scope filters **before** relevance ordering, pagination and facet aggregation, preventing count and ranking leaks.
- REST and MCP return the same actor-scoped results for the screen kind. Unknown/denied IDs use the existing opaque 404 behavior.
- Rights labels, license claims and metadata-only serving decisions remain independent of permission to display metadata. Screens have not been automatically cleared for redistribution.
- Existing artifact registration and source/rights qualification remain unchanged. Synthetic fixtures are labeled synthetic; no real third-party product screens or historical customer data are imported by this change.

## Provenance and evaluation limitations

This is an **opt-in lexical search** surface over pre-existing or separately qualified corpus data, not semantic/vector/image similarity and not a scalable Mobbin/Refero screen library. Research content must pass the separate qualified provenance gate from the independent P10-G23 branch before use with external records. The search endpoint itself does not perform a curator review.

No claims about relevance@K on production-like licensed screen corpora can be drawn from the synthetic tests. Benchmark PR #172 measures a different competitive research task set and is not evidence of superiority until it contains genuine comparable trials.

## Local verification

```sh
node --experimental-strip-types --test apps/web/tests/screen-search.test.mjs apps/web/tests/research-search-ui.test.mjs
node --experimental-strip-types --test packages/assets/tests/search.test.mjs apps/web/tests/search.test.mjs
pnpm --dir packages/assets typecheck
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
node scripts/smoke-research-search.mjs 3197
```

The first suite asserts default behavior, explicit screen retrieval, REST/MCP parity, owner-only workspace visibility, global legacy/private denial, metadata-only resolution, filtered facets and unchanged registry write validation. Tests use an ephemeral PGlite database and contain only invented synthetic data. Retain the existing CI, PStack, OCR and Graft requirements; this document does not approve a merge or release.

The Chromium smoke drives the **actual Next.js /research page** at 390px, 768px and 1440px using synthetic intercepted REST envelopes. It verifies URL encoding and the explicit screen-kind filter, visible metadata-only labels, clearing stale results, and denial-state behavior; the real PGlite actor authorization is established by the separate search tests. The smoke was mutation-tested: when the expected screen kind was intentionally changed to `font`, it failed with exit code 1 and the expected error, then the correct script was restored.
