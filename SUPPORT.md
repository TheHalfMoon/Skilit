# Skilit Support and Issue Routing

Skilit is currently a **development-stage, local-first** product. There is no public hosted support service, guaranteed response time, or generally available release.

## Where to ask

| Need | Recommended route |
| --- | --- |
| A reproducible non-security defect | [Bug report](.github/ISSUE_TEMPLATE/01_bug_report.yml) |
| A scoped feature or usability proposal | [Feature proposal](.github/ISSUE_TEMPLATE/02_feature_request.yml) |
| How to set up local development | [Contributing](CONTRIBUTING.md) and [clean-install procedure](docs/operations/CLEAN_INSTALL.md) |
| How browser login and workspaces operate | [Browser workspaces](docs/operations/BROWSER_WORKSPACES.md) |
| API/MCP design and accepted capabilities | [Product contract](PRODUCT.md) and [architecture](ARCHITECTURE.md) |
| Security vulnerability or private credentials exposed | Follow [security guidance](SECURITY.md); avoid public issues |
| Contributor conduct or moderation concern | [Community standards](CODE_OF_CONDUCT.md) and platform reporting tools |

## What to include in a bug report

Use the [bug report form](.github/ISSUE_TEMPLATE/01_bug_report.yml); it already collects the revision, environment, expected and observed behavior, reproduction steps and sanitized evidence. Use synthetic workspace data and images wherever possible. A product screenshot should not reveal customer content or access tokens.

If a failure involves a malicious URL, login bypass, privacy leak, secret, private workspace access, supply chain compromise, or another vulnerability, **do not post exploit details publicly**. Use private GitHub vulnerability reporting if offered; otherwise obtain an appropriate private maintainer contact route before disclosing details.

## Project status

Repository CI is a development qualification signal. It does not certify public hosting, real-user onboarding readiness, commercial availability, clinical or financial use, or unrestricted user signup. Release decisions remain gated on the owner gates recorded in the [release decision record](docs/qualification/V1_LOCAL_RELEASE_DECISION.md). Do not infer a deployment URL from development examples or metadata.

## Maintenance constraints

Avoid attaching large binary media or real datasets to tickets. Submit focused PRs with current canonical SHA and mandatory review evidence; consult [GOVERNANCE.md](GOVERNANCE.md) for the required gates. If a mandated gate cannot be run, report the actual missing gate rather than presenting a substitute as equivalent.
