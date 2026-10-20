# G01-02b — Isolated Screenshot Queue Transplant

Status: candidate for exact-HEAD review; not a public product capability

## Dependency and Scope

G01-02a is canonical in PR #6, merged on `main` at
`8ff53f3cd9f392f00f5718eb2ac2981adcdbb1a0`.

This grain imports **one** verified and previously preflight-qualified source
file from the Monet Registry commit pinned in `UPSTREAMS.lock.yml`.
The source is the small in-memory `ScreenshotQueue` class used to sequence
capture identifiers. It is copied verbatim; no full Monet runtime, dataset,
media asset, or product identity is introduced.

| Identity | Value |
| --- | --- |
| Pinned donor | `monet-design/monet-registry@85c966f8d94572431bcbb4439f9fd7ea2a893321` |
| Donor path | `scripts/screenshot/queue.ts` |
| Donor Git blob | `ec78d916afc88d7ed6ee72a0b16dde9f7a2fbbe2` |
| Skelet destination | `packages/providers/monet/screenshot/queue.ts` |
| Import mode | Verbatim; original blob SHA is preserved |
| Permissions | Code-only founder authorization; upstream open-source license still not verified |

The machine-readable import record is
`imports/monet-registry/accepted-code/screenshot-queue.json`.

## Qualification

The test matrix must cover empty dequeue, single and batch FIFO, peek,
duplicate identifiers, empty batch, and instance isolation.

```powershell
python -m unittest discover -s tests -q
node --experimental-strip-types --test tests/node/monet-screenshot-queue.test.mjs
npx --yes --package=typescript@5.9.3 tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext packages/providers/monet/screenshot/queue.ts
```

GitHub Actions runs these Python and isolated Node/TypeScript checks against
an exact PR HEAD, alongside the Graft graph/freshness job and normal PStack/OCR
review gates.

## Deliberate Limitations

This is **not** a durable job queue, worker orchestration system, screenshot
collector, web UI, or complete P01 build. The class holds a local array in
memory and is not safe for distributed coordination or crash recovery.
The canonical persistent worker job queue remains the PostgreSQL-backed
implementation scheduled for P02, not this donor helper.

G01-02a's preflight audit JSON is a historical record of the state before
this transplant, not a live assertion that all candidates remain unimported.

Do not mark P01 complete until a clean, usable Skelet product baseline
is imported/qualified, quarantined donor paths are deliberately adapted or
excluded, complete dependencies are validated, and the full product build
and runtime smoke tests pass. No rights to source media/trademarks are implied.
