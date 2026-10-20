# Contributing to Skilit

Thanks for helping build Skilit, a **local-first design intelligence workspace for humans and AI agents**. Skilit is under active development and qualification. Passing tests is not permission to publish a release.

## Start with the project contracts

Read the [product contract](PRODUCT.md), [architecture charter](ARCHITECTURE.md), [security charter](SECURITY.md), [governance policy](GOVERNANCE.md), [code provenance rules](CODE_PROVENANCE.md), [data provenance policy](DATA_PROVENANCE.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), and [CI contract](docs/operations/CI.md). They are authoritative if this quick-start differs.

Search existing issues and pull requests before proposing a change. Scope your work to a testable problem; do not duplicate an active grain or overwrite a concurrent agent's branch.

## Project areas

- **Lens and Build Kits:** evidence-grounded, safe URL analysis and reproducible design artifacts.
- **Web:** authenticated Gallery, Patterns, Boards, Flows, Lens and responsive interfaces.
- **Agent interfaces:** MCP, REST, SDK/CLI contracts and cross-workspace isolation.
- **Infrastructure:** worker, PostgreSQL, object storage, provenance, tests and documentation.

## Local setup

Use a clean worktree or branch from the **current** canonical `main`. Preserve existing untracked files, including `.ignore`. The [governance rules](GOVERNANCE.md) prescribe `skilit/pXX-gYY-short-name` branches for adopted implementation grains, with a recorded base SHA.

The root [package.json](package.json) pins pnpm **9.12.0**, supports Node.js **>=20.9.0**, and CI uses a pinned Node 22 toolchain. For Python and database prerequisites follow the [clean-install procedure](docs/operations/CLEAN_INSTALL.md); apply database migrations as described in the [runbook](docs/operations/RUNBOOK.md).

```sh
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
pnpm --dir apps/web dev
```

This starts a **local development server**, not a publicly hosted site. For login and workspace behavior, read [Browser workspaces](docs/operations/BROWSER_WORKSPACES.md). Use synthetic users and disposable databases for tests; never run test mutations against production data.

## Verify changes

Run checks relevant to your patch and report actual outcomes:

```sh
pnpm --dir apps/web lint
pnpm --dir apps/web typecheck
pnpm --dir apps/web build
pnpm test
python -m unittest discover -s tests -v
python scripts/validate_upstreams.py
python scripts/validate_build_kit.py
python scripts/validate_skills.py
python scripts/validate_agent_contract.py
python scripts/validate_registry.py
```

The [CI contract](docs/operations/CI.md) is the authoritative list of required checks.

Some tests need services or fixtures. Clearly label skipped or blocked checks; never infer PASS from a command that was not executed. UI changes should use Chromium-based desktop/mobile interaction tests and accessibility checks. API/MCP changes should test denied requests, stable typed errors, secret handling, and cross-workspace boundaries.

**Required exact-diff review gates** come from [GOVERNANCE.md](GOVERNANCE.md):

1. **Graft:** verify the dependency graph and blast radius against the canonical base.
2. **TypeSafe Jev:** complete exact-diff review with no unresolved blocking findings.
3. **Alibaba Open Code Review:** perform exact-diff applicability preview and any required review or permitted delegated coverage. Documentation-only grains still require `ocr delegate preview`; do not call a preview a completed review.
4. **GitHub CI:** all required checks green on the exact pull-request HEAD, followed by verification on merged `main`.

If a mandated tool is unavailable, **leave the work unmerged** and record the blocker. Unrelated tools do not automatically substitute for required evidence.

## Pull requests

Use the [pull-request template](.github/PULL_REQUEST_TEMPLATE.md). State the grain ID/adopted plan reference, exact base SHA and head SHA, intended scope and changed contracts, local checks, review-tool outcomes, CI links, remaining risks and provenance/license duties.

Make focused PRs, preserve other agents' work, and use normal merge commits only after all gates pass. Do not force-push governed branches, change signed historical artifacts, publish packages, create release tags, deploy publicly, or enable uncontrolled signup without explicit authorization.

## Security and private reporting

Treat URLs, HTML/SVG, screenshots, imported assets, models, session credentials and MCP arguments as untrusted. Never publish keys, cookies, sensitive workspace material, live private URLs or exploit instructions in issues, logs or test screenshots.

Follow [SECURITY.md](SECURITY.md). If available, use GitHub's **private vulnerability reporting** instead of a public issue. Otherwise arrange a private channel with the repository maintainers before sharing vulnerability details.

## Source reuse and conduct

Follow [CODE_PROVENANCE.md](CODE_PROVENANCE.md): source-copy permission does not by itself grant rights to fonts, data, screenshots, brand marks, model weights or hosted services. Pin immutable upstream versions and retain required NOTICE and attribution. Avoid paid or cloud-only dependencies without an approved decision.

Use English for repository artifacts, reviews, issues and PRs, as required by governance. Follow the [community standards](CODE_OF_CONDUCT.md), and see [support and issue routing](SUPPORT.md) for the appropriate channel. Be respectful, specific, and evidence-driven, and distinguish verified behavior from proposals.
