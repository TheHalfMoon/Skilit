# P10-G25 — Workspace-public artifact authorization hardening

**Status:** security-fix candidate, not an authorization to merge or release.

## Confirmed defect and risk

The central `getArtifactForActor` read gate previously returned all `visibility='public'` artifacts before checking `workspaceId`. A workspace-bound public artifact could therefore disclose its title, rights and source metadata to any authenticated outsider via `get_object` REST/MCP (and potentially downstream readers). This contradicted the AF-SEC-00 rule that workspace-bound artifacts require membership even when the visibility label is public.

The `findSimilarForActor` SQL candidate predicate had an analogous shortcut: `a.visibility = 'public' or …` bypassed membership, allowing an outsider to discover the candidate's title, relevance score or positive result count.

Both were proven against ephemeral, real PGlite **before** patching:

- `P10-G25 workspace-bound public metadata requires membership before all reads` failed because an outsider received the complete workspace-public artifact instead of `null`.
- After closing the central gate, the same test still failed: outsider similarity total was **1** instead of **0** (positive existence oracle).

## Fix and policy

- **Truly global public** artifacts (`workspace_id is null`, `visibility='public'`) remain readable to authenticated actors.
- **Truly global registry** icon/logo/font records preserve their pre-existing curated-corpus behavior. Their byte serving still needs the separate license, rights and trademark gates.
- **Workspace-bound public** artifacts now require workspace membership before read; members and owners retain access. Workspace/private policy is unchanged.
- Similarity candidate SQL mirrors this exact public/global vs workspace-member separation. Candidate scope is applied **before** scoring, counting and pagination.
- Denied and nonexistent artifact REST/MCP lookups both return the opaque `FORBIDDEN_OR_NOT_FOUND` envelope; references cannot be moved into an unrelated workspace through a collection.

This is a source/privacy **metadata** vulnerability as well as a design-corpus rights issue. It is not a claim that raw screenshot bytes were leaked.

## Regression and acceptance

- `packages/db/tests/artifact-access.test.mjs`: outsider denied; workspace owner/member admitted; zero outsider similar candidates; member candidate visible; denied `saveReference` with no existence oracle.
- `apps/web/tests/public-workspace-scope.test.mjs`: REST + MCP denied/error parity and missing-object parity; global public compatibility.
- No new endpoint, dependency, auth role, database table or migration.
- All UI, server, tools and product behavior outside this authorization boundary must continue to pass the repository's required suites and 15-job exact-head GitHub Actions CI.

**Governance:** Must pass independent fresh-context PStack security review and the Alibaba OCR delegated review policy; a D1 author self-check is not independent. Keep Draft until those are qualified. No releases, tags, deployment, publication or paid models.
