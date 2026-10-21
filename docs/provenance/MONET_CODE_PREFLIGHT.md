# G01-02a — Monet Code Snapshot Preflight

Status: candidate for governed review (no donor code imported)

## Scope

This grain verifies the previously admitted Monet Registry source selection without
copying executable donor code into Skelet. It is a bounded safety and provenance
preflight for G01-02, not a replacement for G01-02 runtime qualification.

- Canonical dependency: G01-01a, merged as PR #5 at
  `7f4ea5ab9f8385e3a0fd665e8e09d5dc8af5d724`.
- Exact upstream code source:
  `monet-design/monet-registry@85c966f8d94572431bcbb4439f9fd7ea2a893321`.
- Pinned upstream tree: `9c0096e607a067a4f1917f5d49aab1a4dd1b9b46`.
- Canonical selection: `imports/monet-registry/manifest.json`.
- File identity index: `imports/monet-registry/source-tree.tsv`.
- Machine-readable qualification inventory:
  `docs/provenance/monet-code-snapshot-audit.json`.

## Reproduce Offline

Obtain the source bytes for **only** the 90 selected regular files from the
exact pinned upstream commit. Never use a moving branch name for extraction,
and verify the upstream commit/tree identity before reading source objects.
The source path below is an input directory of *already extracted* file bytes.

```powershell
python scripts/audit_monet_code.py --source D:\Skelet_G01_02_snapshot --output docs/provenance/monet-code-snapshot-audit.json
python -m unittest discover -s tests -q
python scripts/validate_upstreams.py
```

The script does not access the network, mutate source bytes, copy donor files,
or permit runtime activation. It validates source file regularity, manifest
state, selected path containment, Git blob SHA-1/byte-length identity, and
duplicate source names before classifying each selected file.

## Result and Interpretation

- **90** selected source blobs, **687,236** exact verified bytes.
- **45** conservative code/configuration candidates.
- **45** quarantined files pending deliberate English-language adaptation,
  identity/configuration review, or donor provenance review.
- Non-ASCII characters trigger conservative quarantine. This is a mechanical
  review criterion, **not proof** that every such file contains non-English
  text. Other quarantine reasons include non-code documentation, donor-specific
  branding/identity, or invalid encoding.
- A code candidate is **not** a self-contained dependency-safe module and does
  **not** imply a pass on typechecking, builds, tests, or security analysis.
- The code-only reuse authorization must not be construed as a grant to use
  original screenshots, datasets, model weights, hosted services, trademarks,
  logos, or third-party assets.

The report is a reproducible input for splitting the next import into
dependency-bounded code grains. No source files are activated in this change.

## Next Gate

G01-02 implementation requires: inspecting dependencies on excluded source
paths, retaining source attribution, adapting required donor code into
English, discarding old product configuration/branding, qualifying clean
install/build/tests/CI, and passing Graft, the exact-HEAD PStack review panel, Alibaba OCR,
and post-merge verification before advancing to P02. Never silently import a
quarantined blob.
