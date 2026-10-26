# P10-G30 — PGlite data-directory symlink hardening

**Status:** Draft security candidate; no release, merge or deployment approval.

## Security boundary

`prepareDataDir` in `apps/web/lib/mcp-db.ts` handles the operator-selected local PGlite directory containing password verifiers and session-token hashes. Before this change it used `mkdirSync(...recursive)` followed by a path-based `chmodSync(dataDir, 0o700)`. If the final configured component resolved to a symbolic link, `mkdirSync` could succeed and `chmodSync` would follow the link, unexpectedly changing permissions on the unrelated target. It also created a path-to-permission-change substitution window.

## Fix

- On POSIX, open the final directory with `O_DIRECTORY` and `O_NOFOLLOW`; bind the `0700` permission change to that **same descriptor** using `fchmodSync`, then verify `fstatSync` and final `lstatSync` still refer to the same inode/device and are not symbolic links.
- Close the directory descriptor on both success and failure.
- On Windows, where directory descriptor operations differ, explicitly `lstatSync` the final entry and reject a symlink before preserving the existing `chmodSync` behavior. This branch does **not** claim POSIX-equivalent race protection on Windows.
- Preserve automatic private nested directory creation and tightening of legitimate already-existing directories.

## Regression and limits

The existing `apps/web/tests/data-dir-permissions.test.mjs` checks relative-path refusal, new and nested directories, and tightening an existing `0755` directory to `0700`. The new POSIX-specific test configures a symlink to an unrelated `0755` directory, requires refusal, and verifies the target's permissions stay unchanged. This is a deterministic symlink fixture, not a claim that arbitrary privileged filesystem races have been defeated.

The directory's ancestors and operator-controlled environment remain a deployment trust boundary; do not let an untrusted actor select `SKILIT_MCP_PGLITE_DATA_DIR` or write into its parent directories. The PGlite store is local and remains private, with no new model, paid service, network egress or database schema change.

**Verification status at submission:** GitHub CI (including web unit tests, TypeScript and lint) and CodeQL must run on this exact commit. Local Mac execution unavailable because the authorized Desktop Commander monthly allowance is exhausted; no local test success is claimed. Independent fresh-context PStack security review is still mandatory. Keep Draft, do not merge, deploy, tag or release.
