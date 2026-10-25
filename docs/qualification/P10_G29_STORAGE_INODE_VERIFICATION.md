# P10-G29 — Same-descriptor content verification and publication inode identity

**Status:** security correction candidate, not a release or merge approval.

GitHub CodeQL extended scan on pre-PR protected `main` reported **alert #31, `js/file-system-race`**, against the temporary content-addressed upload verification in `packages/storage/src/storage.ts`. The prior implementation synced and closed the uploaded temporary file, then **reopened its pathname** for hash verification. A malicious same-user local process or adversarial source callback could replace that pathname before verification or before canonical hardlink publication.

## Defect reproduction

An isolated ephemeral-fixture test uses the upload source iterator itself to rename the newly opened temporary pathname and put a symlink at the same name, while leaving the original open descriptor writable. The first attempted same-descriptor fix still **failed** the test (assertion: expected rejection but publication succeeded), demonstrating that verifying the open inode alone does not prove the *pathname used for hardlink publication* still points to it.

## Corrective measures

- Open newly created private temporary files with exclusive **read/write** access (`wx+`, mode `0600`); after sync, read verified bytes using **the same open descriptor** with explicit offsets and a bounded 64 KiB buffer. No verifier reopen by name.
- Compare recorded hash, byte length and the descriptor's regular-file stat. Check that the temporary **pathname** is not a symlink and has the same device/inode as the verified descriptor before close.
- After atomic hardlink promotion, verify that the published canonical name is a regular file, not a symlink, and has the same verified device/inode. If this identity test fails, refuse the upload and clean up the just-created target.
- Preserve deduplication, atomic no-overwrite hardlink, existing-object re-verification, fsync directory steps, aborts, byte/time limits, private roots and caller-managed rights/workspace qualifications.

This protects against the **demonstrated** callback-driven pathname replacement and catches further substitutions on the observed publication path. The storage root must remain operator-owned/private (`0700`); this is not an OS-level defense against a fully privileged adversary able to swap paths after every check.

## Local evidence

- The new real-filesystem symlink substitution test was **RED** against the initial descriptor-only rewrite; upload incorrectly succeeded. After adding the inode identity checks the entire storage suite is **12/12 PASS** with zero skips on POSIX/macOS. The race fixture is skipped on Windows because opened temporary files have different rename semantics.
- Existing concurrent identical upload, corrupt object, SHA256 digest, aborted stream, garbage collection and symlink root tests continue to pass.
- `packages/storage` strict TypeScript, ESLint, `ci_hygiene.py` and exact-head GitHub CI/CodeQL must be checked and recorded separately. No paid services, models, downloads or external datasets.

**Governance:** CodeQL alert disappearance does not certify storage against a fully privileged local attacker. Independent fresh-context PStack review (correctness, parsimony, product, security) is still mandatory. Keep Draft, do not merge, deploy or release.
