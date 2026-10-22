# Skilit Implementation Completion Matrix

Status: **RECORD (not a publication).** No release, no tag, no deployment and
no publication is performed by this document, and nothing here is a
go-ahead for one.

Base: `361f22f7a022a18cb5e85505fda2671ff3b363f3` (main at the merge of the operator-invitation grain, PR #170).

Purpose: one table that answers **is every planned grain implemented, and
where is the evidence?** The three companion records answer different
questions and are not duplicated here:

| Record | The question it answers |
| --- | --- |
| `docs/qualification/AF-12_ACCEPTANCE_MATRIX.md` | is each plan row *accepted*, and what is its evidence? |
| `docs/qualification/V1_LOCAL_ACCEPTANCE_CONTRACT.md` | what does v1 Local *contract* to support? |
| this record | is every planned grain *implemented*, and in which pull request? |

## The plan's own implementation sequence (`docs/IMPLEMENTATION_PLAN.md` §20)

The plan names nineteen "First Implementation Grains" and says they are the
default pull-request sequence. Every one of them is implemented and merged.

| Grain | Delivered by | Pull request | Evidence |
| --- | --- | --- | --- |
| G00-01 Repository charter | the charter, `PRODUCT.md`, `ARCHITECTURE.md`, `SECURITY.md`, the governance rules | #1 | AF-12 P00 |
| G00-02 Provenance schemas | `UPSTREAMS.lock.yml` and the provenance documents, with the validation script | #2 | AF-12 P00; `scripts/validate_upstreams.py` |
| G00-03 CI skiliton | the hosted CI with the exact-head evidence convention | #3 | the fifteen-check workflow in `.github/workflows/ci.yml` |
| G01-01 Monet import manifest | the execution-time verified pin and the explicit include/exclude manifest | #4 | AF-12 P01 |
| G01-01a Monet code-only authorization | the qualification of one dependency-closed donor capability | #5 | AF-12 P01 |
| G01-02a Monet source selection audit | the audit and quarantine of the pinned selection | #6 | `scripts/audit_monet_code.py` |
| G01-02b Monet screenshot queue | the exact transplant with its Node CI | #7 | `packages/providers/monet/screenshot/queue.ts` |
| G01-02c Monet dependency closure | the closure and the quarantine decisions | #11 | `docs/provenance/MONET_*.md` |
| G01-03a Skilit-owned application shell | the runnable Next.js shell | #12 | `apps/web` |
| G01-03b The qualified donor utility | the one donor capability, with its closure proof | #13 | AF-12 P01 |
| G02-01 Workspace reshape | the move of the qualified web code into `apps/web` and the pnpm workspace | the reshape history preceding #14 | AF-12 P02 |
| G02-02 Worker shell and environment contract | `apps/worker`, the environment schema, the health command | #14 | AF-12 P02 |
| G03-01 Database foundation | the PostgreSQL adapter, the migration runner, Source/Product/ProductVersion | #16 | AF-12 P03 |
| G03-02 Artifact, Asset, Relation and Pattern | the content-addressed graph and its constraints | #18 | AF-12 P03 |
| G03-03 Workflows, runs, collections and import mapping | Flow, FlowStep, Collection, CaptureRun, AnalysisRun, ImportRecord | #20 | AF-12 P03 |
| G03-04 Object storage | the storage interface, the local filesystem provider, SHA-256 dedupe | #22 | AF-12 P03 |
| G04-01 Auth baseline | the auth and session tables, sign-up, sign-in, sign-out | #23 | AF-12 P04 |
| G04-02 Workspaces and roles | the workspace authority and its denial matrix | #24 | AF-12 P04 |
| G04-03 Collections | the collection lifecycle and the save-reference path | #25 | AF-12 P04 |
| G04-04 Billing boundary | the plan model, the capability gate and the webhook intake | #26 | AF-12 P04 |
| G05-01 Job queue lifecycle | the PostgreSQL queue, cancellation, retry and dead-letter | #27 | AF-12 P05 |
| G05-02 Provider contract | the provider schemas, timeout, health and egress classification | #28 | AF-12 P05 |
| G05-03 Publish transaction | raw → normalize → dedupe → validate → publish, with partial enrichment | #29 | AF-12 P05 |

## The grains the AF-00 blueprint added after the plan's sequence

The plan's nineteen grains end at the publish pipeline. The AF-00 blueprint
(`docs/architecture/AGENT_FIRST_BLUEPRINT.md`, merged as #63) added the agent
platform, the Lens capture stack, the Build Kit and the acceptance work. The
whole of that programme is implemented; the rows are grouped as the AF-12
matrix groups them, and the AF-12 matrix carries the row-by-row evidence.

| Area | Grains delivered | Pull requests |
| --- | --- | --- |
| P06 Assets | G06-01 registry, G06-02 icon importer, G06-03 brand/font ingestion | #30, #31, #32 |
| P07 Component registry | G07-01 endpoint, G07-02 clean-consumer install proof | #33, #35 |
| P08 Agent platform | G08-01 transport, G08-02 write tools, G08-03 REST parity, G08-04 skills, G08-05 TypeScript SDK, G08-06 Python SDK and CLI | #36–#41 |
| P09 Lens | G09-01 intake guard through G09-13 paste-URL-to-report | #42–#56 |
| P09b Build Kit | G09b-01 manifest through G09b-07 starter synthesis | #57–#65 |
| AF-01–AF-15 | the acceptance, interoperability, security, coverage and release work | #66–#105 |
| P10–P15 | the research corpus, multimodal search, MCP Apps core, change intelligence, the OpenPencil adapter and the commercial skeleton | #106–#140 |
| R0–R7 | provenance, the runnable shell, tenant isolation, the end-to-end journey, the guarded Lens, the qualified corpus and search, the security and operations drill, and release correctness | #2, #22, #66, #68, #72–#81, #89–#91, #93, #98, #100–#105, #113 |
| Release preparation | the acceptance contract, the cloud backlog, the clean-install proof, the RC builder, the Issue #62 report, the release decision record, the licence and notice | #141–#148 |
| The local web product | the security headers, the home navigation, the Skilit identity, the primary navigation, the cookie-first surfaces, the authorized workspace selector, the contributor documents, the brand system and the real authenticated browser journey | #149–#166 |
| Governance | the review-stack migration that waives the metered Jev gate and installs the zero-cost PStack panel | #167 |
| P00-G18 | account sessions: the account surface, the session list, one-session revocation, sign-out everywhere else, and the account page | #168, #169 |
| P00-G19 | operator invitations: the invitation link, the roster with addresses, the acceptance and the role-aware workspace surface | #170 |

## What is not implemented, and why

Nothing in the plan's own nineteen grains is outstanding. The gaps below are
authorised deferrals or owner gates, and each one is recorded where it
belongs — in the AF-12 matrix row's "Gap" and "Next" fields, in the
disposition records under `docs/qualification/`, and in the v1 Local
acceptance contract. They are listed here so that a reader of this matrix
does not have to reconstruct them.

| Item | Why it is not implemented | Where the trigger lives |
| --- | --- | --- |
| live browser recording | the capture client is deferred; the qualified path replays a consented, recorded ledger | `P10_CAPTURE_DISPOSITION.md`; AF-12 P10 |
| semantic and visual embeddings, hybrid ranking | the qualified baseline is lexical and deterministic | `P11_SCOPE_DISPOSITION.md`; AF-12 P11 |
| MCP Apps `ui://` views | the qualified core is the collections-backed board and reference packs | `P12_APPS_DISPOSITION.md`; AF-12 P12 |
| scheduled watch, subscribe and change scoring | the qualified path is the read diff | `P13_SCOPE_DISPOSITION.md`; AF-12 P13 |
| Mobbin parity, screen-gallery wording | the corpus importer is Skilit-owned and the screen wall is honestly a non-requirement | `P10_NORMALIZATION_NOTE.md` |
| production R2/S3, hosted dashboards, load proof at scale | the supported shape is the zero-founder-spend local core | `CLOUD_COMMERCIAL_BACKLOG.md` |
| an officially signed artifact | the ceremony is verified and the production identity is the owner's | `docs/operations/RELEASE_SIGNING.md`; OD-02 |
| member removal and role change from the interface | the domain primitives are qualified and the invitation grain deliberately did not add a second authorization surface | AF-12 P04's "Gap"; the follow-up is recorded in the panel's known limitations |
| commercial billing enforcement | the plan and the capability model are qualified; enforcement is P15/Cloud | AF-12 P04; OD-03 |

## The owner decisions that are still open

No grain is blocked by them and no engineering is outstanding behind them.
They are the founder's to record, and until they are recorded the candidate
ships nothing.

- **OD-01** — approve v1 Local as replay-only, or approve a consent-UX design
  to build.
- **OD-02** — perform the production signing ceremony, or leave the candidate
  explicitly unsigned.
- **OD-03** — close Issue #62 on the recorded evidence, or name the proof
  still required; and approve the version identifier and the release-candidate
  tag or draft. No final publication without this.
- **OD-04** — (commercial) the Cloud commercial backlog's owner decisions.
- **OD-05** — the licence and notice placement, recorded in PR #148.

## What this record does not say

It does not say the product is released, signed, or published. It does not
claim a CI run on a commit other than the ones its companions name. It does
not treat a deferral as a gap and it does not treat a gap as a deferral: the
two lists above are kept apart on purpose.
