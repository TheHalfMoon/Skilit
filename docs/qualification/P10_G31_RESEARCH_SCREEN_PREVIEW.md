# P10-G31 — Actor-scoped research screen image preview

**Status: Draft qualification candidate. Not release- or merge-approved.**

## Purpose

The current Research screen search displays **metadata only**: titles, source and rights. Skilit already has a local SHA-256 content-addressed byte store and a publication pipeline, but no image-read endpoint for actor-readable, curator-approved research screenshots. This grain adds a small, local-only authenticated preview path, without scraping third-party sites or trusting a submitted image URL.

## Contract

`GET /api/v1/research/screens/[id]/preview` responds with image bytes only when ALL are true:

- A real authenticated actor has access to the screen artifact through `getArtifactForActor`, including workspace membership/owner policy.
- Artifact kind is `screen`, rights are `permitted`, and metadata includes valid curator-submitted `rightsEvidence` plus explicit `previewApproved: true` admission.
- Claimed image license is one of CC0-1.0, MIT, Apache-2.0 or ISC; no trademark flag. This is a **curator attestation, not independent legal verification**.
- The `assets` table contains the same SHA-256, source ID and permitted rights. Declared media is PNG/JPEG/WebP only, between 16 bytes and 4 MiB.
- A separately configured operator-owned `SKILIT_RESEARCH_MEDIA_ROOT` points to the SAME local content-addressed storage used during `publishArtifact`. Storage hash-checks bytes before yielding; the read path verifies size and image signatures again. It never accepts paths from the request or metadata.

Missing/unauthorized/not-approved/no-data all produce a common opaque `FORBIDDEN_OR_NOT_FOUND` response; storage corruption yields a generic internal error. The response is private/no-store, `nosniff`, same-origin and sandboxed. No SVG/HTML, external HTTP image fetch, CDN, remote upload, model call or data egress is introduced.

## Test

`apps/web/tests/research-preview.test.mjs` exercises real ephemeral PGlite, private workspaces, `publishArtifact`, the actual local byte store, actor-authorization parity (missing vs denied), rights/license/approval refusal before byte IO, and active SVG/MIME-spoof refusal. These use only synthetic author-owned fixtures.

GitHub CI and CodeQL must run on the **exact candidate head**. Local Mac test execution is unavailable because the authorized Desktop Commander quota was exhausted; no local tests are claimed. A future UI grain must only show previews when the authenticated server confirms eligibility, rather than generating image URLs indiscriminately. Existing Research metadata-only results remain unchanged.

## Required independent gates

CodeQL and CI cannot replace fresh-context PStack four-bar/security review or curator rights verification. Public real-world screen datasets, competitor trials and release qualification are separate unresolved gates. Keep Draft; do not merge, tag, publish, deploy or use any paid services.
