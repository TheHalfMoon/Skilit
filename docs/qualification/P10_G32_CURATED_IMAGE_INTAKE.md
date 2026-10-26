# P10-G32 — Operator-only curated research image intake

**Status: Draft candidate. Not independently security-qualified or merged.**

## Purpose

G31 provides a protected, signed-byte preview of curator-approved screen images
but did not provide a way to admit a genuine local image. G32 adds a
**local-operator CLI**, not a web upload endpoint or a crawler, and reuses the
existing PGlite database, byte store, and authenticated preview gate.

- The image is read from an absolute local file, using a verified descriptor
  and refusing final-component symlinks on supported POSIX platforms.
- The operator supplies explicitly reviewed provenance, previewApproved=true,
  and an existing source and admin/owner workspace actor.
- Actual artwork is never licensed by merely having permissively licensed
  source code. Image-specific rights must be independently verified.
- Image MIME and binary signatures are checked against the same bounded list
  on input and preview: PNG, JPEG, WebP, up to 4 MiB. SVG/HTML are refused.
- Authorization is rechecked **within the publication database transaction**
  before content-addressed storage and the artifact row are created.
- The manifest may choose private or workspace visibility only.
- CLI always selects local PGlite, ignoring any remote PostgreSQL URL in the shell.
- No network fetching, remote APIs, models, paid resources, public upload,
  release, tag or deployment.

## Local operator procedure

Use the **same** persistent SKILIT_MCP_PGLITE_DATA_DIR database and
SKILIT_RESEARCH_MEDIA_ROOT storage root as the local web app. These must be
operator-controlled absolute paths. The workspace, curator and source UUIDs
must already exist; the curator must have admin or owner role.

A JSON manifest with real existing IDs has the following shape:

~~~json
{
  "sourceId": "REPLACE_WITH_EXISTING_SOURCE_UUID",
  "workspaceId": "REPLACE_WITH_EXISTING_WORKSPACE_UUID",
  "curatorId": "REPLACE_WITH_EXISTING_ADMIN_UUID",
  "title": "Checkout screen",
  "mediaType": "image/png",
  "previewApproved": true,
  "visibility": "private",
  "rightsEvidence": {
    "originUrl": "https://source.example/approved/screenshot",
    "sourceRevision": "0123456789abcdef0123456789abcdef01234567",
    "rightsHolder": "Verified Rights Holder",
    "rightsBasis": "explicit-permission",
    "licenseId": "CC0-1.0",
    "licenseEvidenceUrl": "https://source.example/rights",
    "reviewRef": "internal-reviewed-permission-2026"
  }
}
~~~

The URL/license values are illustrative, not evidence of permission. Only
accurate, curator-reviewed image redistribution evidence is acceptable.

Run, from the repository root:

~~~sh
SKILIT_MCP_PGLITE_DATA_DIR=/absolute/skilit-db \
SKILIT_RESEARCH_MEDIA_ROOT=/absolute/skilit-media \
node --experimental-strip-types scripts/import_curated_image.mjs \
  /absolute/manifest.json /absolute/screenshot.png
~~~

The CLI prints the new artifact and asset IDs on success, or a generic refusal
without local path disclosures on failure. The Research page finds the artifact
by its title, then an authorized actor can select View approved image.

## Evidence

- Real PGlite/storage: approved 1x1 PNG is published through the same
  publishArtifact pipeline and retrieved through the authenticated G31 preview.
- Denied actor, unknown source, unsupported media, spoofed signature, missing
  approval and invalid rights refuse before storage IO/writes.
- The actual CLI is exercised against persistent disk-backed PGlite and
  local SHA-256 storage and retrieved with the G31 preview.
- Five dedicated focused tests are included in the ingest CI job.

## Remaining blockers

Tests use synthetic pixels and example.invalid provenance. No licensed external
screens have yet been provided, ingested or counted. An operator must verify
each rights record. There is no curator UI, batch import workflow, thumbnailing,
screenshot similarity indexing, or authentic Mobbin/Refero benchmark score yet.

Independent fresh-context PStack four-bar/security review, inherited CodeQL
findings in issue #180, and exact-head CI/CodeQL remain mandatory for merge.
**Do not merge protected main, tag, deploy or release.**
