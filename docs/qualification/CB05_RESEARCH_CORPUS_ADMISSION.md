# CB-05 — Qualified research corpus admission (no dataset shipped)

**Status:** engineering admission-path candidate only. Source revision pinned at the implementing PR; **no real screenshots or competitor datasets have been imported**.

This is an opt-in ingestion entry point for *external research material*. It is not a web crawler, a permission checker, or a substitute for a curator's legal review. It complements the existing fixture-only path without changing its behavior.

## Contract

Call `importQualifiedResearchCorpus(db, { sourceId, sourceVersion, corpus })` instead of `importCorpusFixture` for curator-reviewed, externally sourced research objects.

Every artifact in the source's `products[].versions[].artifacts[]` must carry `rightsEvidence` with:

- `originUrl`: an exact public HTTPS source reference, without credentials, query strings or fragments.
- `sourceRevision`: the 40- or 64-character immutable source commit/content digest; never a moving branch.
- `rightsHolder`: the rights holder identified by the curator.
- `rightsBasis`: `author-owned`, `open-license`, or `explicit-permission`.
- `licenseId`: the curator's declared license/permission identifier, not an automatically verified legal conclusion.
- `licenseEvidenceUrl`: an HTTPS source for the permission/license, without credentials or query strings.
- `reviewRef`: a safe ID for the curator's durable review record; no email, phone, access token or personal secrets.

The qualifier rejects unknown rights and incomplete/invalid evidence **before writing to the database**. The existing transaction-ledger import path persists `metadata.rightsEvidence` alongside each artifact and binds the complete evidence record to its replay fingerprint. Any altered evidence under an existing external identity is a conflict and is not silently substituted.

**Important:** a repository's source-code MIT/Apache license does **not** automatically license screenshots, product UIs, company trademarks, datasets, images, or third-party assets. A valid URL, SPDX-like name or digest does **not** prove that the source owns or grants those rights. Curator must review scope, permissions, provenance, re-distribution constraints and takedown rules independently.

The old `importCorpusFixture` remains for controlled and clearly marked synthetic fixtures. It must **not** be described as a rights-qualified importer, nor used to claim library size. These tests only use `example.invalid` references and synthetic names; they provide no licensed third-party material.

## Current limitations

- A caller must still authenticate and authorize the `sourceId` and each workspace before admission; **this wrapper does not add authentication**, since the existing low-level transaction importer already requires this precondition.
- The wrapper neither fetches nor verifies the referenced URL. It stores the curator's attested provenance, not independently inspected screenshots or legally reviewed permission.
- A trusted consumer must call the qualified entry point; the legacy fixture function remains separately exported. This is **not** a global security firewall for every existing dataset path.
- Asset bytes, corpus-scale throughput, takedown workflows, and rights grants for external products require separate qualifications under CB-05/CB-16.
- No actual competitor screen corpus, external paid model/API, cloud provider, publication, release or deployment is part of this change.

## Validation

```sh
node --experimental-strip-types --test packages/ingest/tests/qualified-corpus.test.mjs
pnpm --dir packages/ingest lint
pnpm --dir packages/ingest typecheck
```

Completion of these tests qualifies the **mechanics of the admission contract only**. It does not certify legal permissions or demonstrate Mobbin/Refero parity.
