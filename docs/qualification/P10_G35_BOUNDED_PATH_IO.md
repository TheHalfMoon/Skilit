# P10-G35 — Bounded local image/manifest IO and name-chain revalidation

**Status: Draft / security hardening, not independent security approval.**

## Finding

P10-G34 rejected oversized image files based on an initial descriptor `stat`, but
then read images via an **unbounded** `handle.readFile()` operation. A concurrent
local process capable of appending to a previously accepted input file could
make the read consume far more than the 4 MiB/image preflight budget. The JSON
manifest had the same issue after its initial 128 KiB limit check. In addition,
final-component symlinks relied on `O_NOFOLLOW` when supported: Windows may not
provide the same flag, and name/path substitution after `stat` deserved a
second check. The risk relates to untrusted local filesystem mutation, not to a
remote unauthenticated web user; this is an operator-only CLI.

## Change

- Allocate a fixed-size buffer from the *already bounded descriptor size* for
  each image (max 4 MiB) and manifest (max 128 KiB). Positional `read()` loops
  fill precisely that many bytes, then a one-byte probe at the original EOF
  rejects appended bytes. Reject truncation and descriptor size changes.
- `lstat` the image/manifest filename before and after the bounded read;
  refuse final-component symlinks independently of the platform's
  `O_NOFOLLOW` support, and compare device/inode to the open descriptor.
- Snapshot all input-root/intermediate directory entries before opening each
  image and revalidate that their names still refer to the same non-symlink
  directories before accepting the file.
- Keep the existing mandatory SHA-256 comparison, MIME signature check,
  restricted relative-path grammar, validation of all images before writes,
  explicit local PGlite and transaction-scoped actor authorization.
- No new dependency, network service, cloud model, HTTP upload or license grant.

## Evidence

The extended `packages/ingest/tests/research-batch.test.mjs` includes real
on-disk symlink substitution at the image filename, a symlinked manifest,
oversized inputs, structural bounded-read assertions, two synthetic PNGs
committed to persistent PGlite, preview denial for outsiders and replay
collision refusal. Run with:

    node --experimental-strip-types --test packages/ingest/tests/research-batch.test.mjs
    pnpm --filter skilit-ingest lint
    pnpm --filter skilit-ingest typecheck

CI's existing ingest task runs this same suite, plus the previous local ingest
pipeline and curation tests. The **exact new PR SHA** must pass CI and CodeQL
before qualification; earlier head approvals cannot be reused.

## Limitations and residual risk

These repeated path checks detect ordinary symlink/name substitution but **are
not race-proof** against a malicious same-account actor able to swap and
restore paths between individual checks. Node's general path-based open does
not grant `openat2`-style beneath-root enforcement on every platform. Source
images, their ancestor directories and the manifest must remain under the
operator's exclusive control. Windows reparse-point behavior and cross-OS
end-to-end testing remain independent review items. Content hash verification
makes unauthorized byte substitution without SHA-256 match infeasible, but it
is *not* evidence of screenshot redistribution rights. Independently
license-verified real screenshots, competitor benchmarks, CodeQL source-to-sink
review and fresh-context PStack four-bar qualification are still missing.

Keep Draft. No merge into main, release, tag, public deploy or paid service.
