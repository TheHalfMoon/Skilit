## Scope and evidence

**Adopted grain ID / plan reference:**

**Canonical base SHA:**

**Exact candidate HEAD SHA:**

**Problem, intended behavior and acceptance criteria:**

**Files, public contracts and human/agent surfaces changed:**

**Out-of-scope work and compatibility considerations:**

## Qualification checklist

Record the **actual** commands, evidence URLs and outcomes. Mark a non-applicable check `N/A` with a reason and a blocked one `BLOCKED`, never as PASS.

- [ ] Positive, negative, boundary and regression tests cover affected behavior.
- [ ] Relevant lint, TypeScript, build, Node/Python, database and REST/MCP tests pass.
- [ ] UI work has responsive real-browser and accessibility checks where applicable.
- [ ] Auth, workspace isolation, privacy and secret handling were considered.
- [ ] New upstream code/assets have documented rights, exact source IDs and required notices.
- [ ] Graft build/check and exact-base blast-radius evidence recorded.
- [ ] PStack review panel completed over the exact diff, covering correctness, parsimony, product completeness and specification alignment, and security/privacy, with no unresolved must-fix finding. If the review was degraded, the degraded level and the additional mechanical and risk-specific checks it required are recorded.
- [ ] Alibaba Open Code Review applicability preview and required review/delegation evidence recorded.
- [ ] Required GitHub CI completed successfully on the **exact candidate HEAD**.

**Local test commands, versions and results:**

**Graft version, run and blast evidence:**

**PStack panel status (independent or degraded), reviewers, base and candidate SHAs, and evidence:**

**Alibaba OCR version, preview reviewable count, status and evidence:**

**Exact-head CI run and conclusion:**

**Known risks, missing evidence, unresolved questions:**

## Merge and release boundaries

- [ ] No unrelated worktree, `.ignore` or concurrent agent changes were overwritten.
- [ ] Synthetic fixtures/logs/screenshots contain no secrets or private user content.
- [ ] Signed historical releases, tags, and API compatibility were preserved.
- [ ] No unapproved release, package publish, tag, public deployment or paid service.
- [ ] Canonical post-merge SHA and `main` CI will be documented before closeout.

> A green CI run does not waive the mandatory review gates in [GOVERNANCE.md](../GOVERNANCE.md). A blocked grain must remain unmerged.
