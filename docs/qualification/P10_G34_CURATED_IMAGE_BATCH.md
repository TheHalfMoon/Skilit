# P10-G34 — Offline, bounded curated research-image batches

**Status:** DRAFT — no release, deployment, merge or independent security signoff.

G32 admitted one image at a time. G34 adds an offline batch CLI that validates
**every approved manifest entry and its actual image bytes before the first
database write**. This is not a crawler, public upload route, legal rights
determination, or source of third-party images.

## Exact operator protocol

A batch contains **1–16 images**, each at most **4 MiB**, with combined image
bytes no more than **32 MiB**. PNG/JPEG/WebP signature, declared extension,
size and lowercase SHA-256 must all agree. Each file is a bounded relative
path within an existing, absolute, operator-controlled image directory.
Traversal, final and intermediate symlinks, duplicate names/hashes/titles,
unknown rights licenses and missing explicit preview approval are refused.

Example JSON (replace all placeholders with actually reviewed information):

~~~json
{
  "schemaVersion": "skilit.curated-images.v1",
  "sourceId": "11111111-2222-4333-8444-555555555555",
  "workspaceId": "22222222-3333-4444-8555-666666666666",
  "curatorId": "33333333-4444-4555-8666-777777777777",
  "entries": [{
    "relativePath": "screens/approved-checkout.png",
    "sha256": "REPLACE_WITH_ACTUAL_IMAGE_SHA256",
    "title": "Approved checkout screen",
    "mediaType": "image/png",
    "previewApproved": true,
    "visibility": "private",
    "rightsEvidence": {
      "originUrl": "https://example.org/screenshot",
      "sourceRevision": "0123456789abcdef0123456789abcdef01234567",
      "rightsHolder": "Verified image rights holder",
      "rightsBasis": "author-owned",
      "licenseId": "CC0-1.0",
      "licenseEvidenceUrl": "https://example.org/rights",
      "reviewRef": "internal-reviewed-permission-2026"
    }
  }]
}
~~~

The example is **not** evidence of permission. Artwork/screenshot rights must
be checked per image. A source-code license does not license screenshots.
Attesting that the license is CC0 does not prove it. This intentionally keeps
the existing G32 allowed-license policy rather than broadening access.

Compute each file's exact hash from local bytes using shasum -a 256.
With valid paths and an operator-controlled root, run dry-run first:

~~~sh
node --experimental-strip-types scripts/import_curated_images.mjs \
  /absolute/batch.json /absolute/approved-images
~~~

Dry-run prints preflight-passed-not-rights-verified with count, total bytes,
and hashes. It does not connect to a DB or publish any data.

After independent image permission review, use an existing local database,
admin/owner workspace membership and source record. Explicit commit only:

~~~sh
SKILIT_MCP_PGLITE_DATA_DIR=/absolute/skilit-db \
SKILIT_RESEARCH_MEDIA_ROOT=/absolute/skilit-media \
node --experimental-strip-types scripts/import_curated_images.mjs \
  /absolute/batch.json /absolute/approved-images --commit
~~~

The CLI always chooses explicit local PGlite, even if inherited remote
PostgreSQL connection variables exist. The database and image root must be the
same persistent operator-controlled environment used by local Skilit.
Before the first write, it rejects missing source, non-admin actor and
pre-existing screen titles in the same source/workspace. It publishes through
G32's transaction-scoped authorization and SHA-256 content storage.

## Important failure contract

**Individual publications are transactions; the whole batch is not atomic.**
The CLI prints each published artifact/asset ID and a count. Unexpected
storage or permission failure partway through can leave a committed prefix.
Do not blindly retry. Inspect the committed IDs and submit a new manifest
containing only unpublished records. Blind replay with an existing title is
rejected. There is no guarantee against concurrent malicious local writers
with control over ancestor paths; operator-managed filesystem access is a
precondition and not an independently certified security boundary.

Six focused tests cover two genuinely encoded synthetic PNGs, exact hash
checks, path traversal, directory symlinks, file/type/rights rejection,
dry-run without DB, all-or-nothing preflight refusal, actual disk-backed
PGlite commit and preview with outsider denial, and replay collision refusal.
These are **synthetic fixtures**, not an imported or licensed third-party
screenshot corpus. Full exact-head CI, CodeQL alert triage, fresh independent
PStack security review, genuine rights-reviewed screenshot acquisition, and
an executed 50-task Mobbin/Refero benchmark remain open. No merge/release.
