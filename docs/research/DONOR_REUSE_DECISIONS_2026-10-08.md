# Skilit Donor Reuse Decisions — Research Snapshot (2026-10-08)

Status: SOURCE DISCOVERY AND ADAPTER STRATEGY ONLY. Links are candidate references, not automatic permission or a verified pin. The canonical `UPSTREAMS.lock.yml` and individual import manifest remain the only activation route.

## Decision order

1. Reuse an **already qualified implementation** in Skilit.
2. Reuse a **mature permissive or otherwise specifically authorized project** with the smallest capability-scoped patch.
3. Use an upstream official API, SDK or registry **as a versioned adapter**, not a monolithic donor transplant.
4. Build the **Skilit-owned integration/domain code** only where no fitting reusable contract exists.

Before copying: verify live repo, exact source commit, release, implementation presence, mandatory notice/license and third-party component/asset rights; map imported source to an acceptance test; inspect vulnerabilities, weight/dependency restrictions, license compatibility, maintenance burden and transitive APIs; retain an immutable per-path manifest. **Founder-stated permission is evidence for its exact scope; it does not turn missing upstream licenses or external media into public domain.**

## High-confidence reusable upstream candidates

| Capability | Source / exact public location | Recommended use | Decision / hard gate |
| --- | --- | --- | --- |
| Capturing pages, DOM, screenshots, browser tests | [microsoft/playwright](https://github.com/microsoft/playwright) | Core browser primitive plus traces/synthetic fixture playback | **ADAPT**, isolate workers and enforce network egress, no user secrets |
| Design token extraction | [dembrandt/dembrandt](https://github.com/dembrandt/dembrandt) | Lens adapter: CSS/token computation, W3C DTCG, DESIGN.md | **ADAPT**, verify headless browser version and export determinism |
| Web/catalog/search baseline | [monet-design/monet-registry](https://github.com/monet-design/monet-registry) | Selectively reuse verified code-only paths | **PARTIAL**, exact source commit in manifest; 45 qualified candidates and 45 quarantined; not a runnable standalone app |
| Component catalogue | [bidyut10/opensourceui](https://github.com/bidyut10/opensourceui) | Research UX and selected components | **EVALUATE**, select original code/license/assets per component |
| Component install contract | [shadcn registry specification](https://ui.shadcn.com/docs/registry) | Skilit native public component registry | **ADOPT SPEC**, registry validation and clean sample-app install required |
| Registry directory | [shadcn registry index](https://ui.shadcn.com/docs/registry/registry-index) | Distribution of public valid Skilit registry | **OPTIONAL PUBLISH**, not required for direct use |
| Icons | [iconify/icon-sets](https://github.com/iconify/icon-sets) | Metadata import and exact licensed sets | **ADOPT SELECTIVELY**, each collection license differs; no all-set blanket allowance |
| Brand icon metadata | [simple-icons/simple-icons](https://github.com/simple-icons/simple-icons) | Brand/logo metadata and licensed byte variants | **SELECTIVE**, trademark rules and per-logo serving restrictions |
| Fonts | [fontsource/fontsource](https://github.com/fontsource/fontsource) | Font metadata, select file bundles | **ADAPT**, check license of **each** family/file; metadata-only if restricted |
| Authentication & organization | [better-auth/better-auth](https://github.com/better-auth/better-auth) | Better Auth and organization plugin | **ADAPT**, own PostgreSQL workspace authorization and lifecycle |
| Auth UX seed | [paceui/nextjs-better-auth-starter](https://github.com/paceui/nextjs-better-auth-starter) | Selected consent/login/organization UX | **EVALUATE**, UI-only where possible; avoid copying starter product identity |
| Postgres job queue | [timgit/pg-boss](https://github.com/timgit/pg-boss) | Retry/lease queue behind Skilit job interface | **EVALUATE**, idempotence and transaction/outbox tested |
| Search index | [pgvector/pgvector](https://github.com/pgvector/pgvector) | Optional embedded vector similarity, alongside PostgreSQL FTS | **EVALUATE**, start lexical and benchmark CPU/rights before adopting |
| Page technology hints | [Houseofmvps/opentechalyzer](https://github.com/Houseofmvps/opentechalyzer) | Bounded, low-confidence tech-clue adapter | **EVALUATE**, no intrusive scans or certainty laundering |
| Brand clues | [tight-studio/OpenBrand](https://github.com/tight-studio/OpenBrand) | Extract logo/brand clues | **EVALUATE**, extracted bytes are not automatically redistributable |
| Visual QA | [squirrelscan/squirrelscan](https://github.com/squirrelscan/squirrelscan) | Optional website audit provider | **DEFER/ADAPT**, Lens must work with provider disabled |
| Flow replay | [rrweb-io/rrweb](https://github.com/rrweb-io/rrweb) | Authorized flow recording and replay | **ADAPT LATER**, remove PII, retention and capture consent |
| MCP protocol | [modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol) | 2026-07-28 normative contract, OAuth, Tasks extension | **ADOPT CONTRACT**, negotiate compatible clients |
| MCP Apps SDK | [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) | `ui://` viewers via official SDK and templates | **ADOPT SDK**, host compatibility and sandbox gates |
| Design editor/export | [open-pencil/open-pencil](https://github.com/open-pencil/open-pencil) | Edit/export design handoff without Skilit canvas | **ADAPT POST CORE**, real import/export round-trip proof |
| OCR / UI parsing | [microsoft/OmniParser](https://github.com/microsoft/OmniParser) | Optional screenshot element extraction | **DEFER**, CPU/GPU cost and model-weight rights must be evaluated |
| Documents | [docling-project/docling](https://github.com/docling-project/docling) | Optional local brand guide ingestion | **EVALUATE POST S1**, not baseline requirement |
| Crawl fallback | [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | Optional provider when Playwright capture insufficient | **DEFER/ADAPT**, no mandatory cloud or paid quota, rights and egress tested |
| Mobile capture | [mobile-dev-inc/Maestro](https://github.com/mobile-dev-inc/Maestro) | Bounded mobile flow automation later | **DEFER**, no mobile device farm for v1 |
| Existing agent/web patterns | [browser-use/browser-use](https://github.com/browser-use/browser-use) | Reference for guarded browser actions, not core autonomous crawler | **REFERENCE**, permission and task sandbox before considering donor code |

## TheHalfMoon cross-repository reuse — verify implementation, not claims

GitHub repository presence/readme verified in the connected TheHalfMoon account on 2026-10-08. These are potential internal source providers, **not automatic dependencies**.

| Existing repo | Possible capability boundary | Classification |
| --- | --- | --- |
| [Lilac](https://github.com/TheHalfMoon/Lilac) | Design editing, format roundtrip and canvas | **COOPERATE**, keep Skilit read/evidence and Lilac edit/design |
| [Kernux](https://github.com/TheHalfMoon/kernux) | Browser/agent capability authorization and sandbox | **REFERENCE FOR NOW**; README explicitly reports no implementation started |
| [Deskal](https://github.com/TheHalfMoon/Deskal) | Trusted local desktop/computer transport | **POTENTIAL ADAPTER**, never import unrestricted computer permissions into web capture |
| [Orcel](https://github.com/TheHalfMoon/Orcel) | Durable agent skills/harness conventions | **REFERENCE/SDK ADAPTER**, preserve public MCP semantics |
| [Morize](https://github.com/TheHalfMoon/Morize) | Provenance-aware cross-agent memory | **OPTIONAL ADAPTER**, not Skilit's canonical storage |
| [Gomrey](https://github.com/TheHalfMoon/Gomrey) | Evidence/document ingestion workflows | **CANDIDATE DONOR**, only if implementation exists and per-grain tests support reuse |
| [Inercative](https://github.com/TheHalfMoon/Inercative) | Agent-driven app generation | **CONSUMER PARTNER**, no duplicate builder in Skilit |
| [SpecGrain](https://github.com/TheHalfMoon/SpecGrain) | Small implementation grains/contracts | **GOVERNANCE REUSE**, no forced runtime coupling |
| [Diffcipline](https://github.com/TheHalfMoon/Diffcipline) | Exact-diff proof/closeout discipline | **GOVERNANCE REUSE**, no product endpoint |
| [Ascout](https://github.com/TheHalfMoon/Ascout) | QA/security/test integration patterns | **REVIEW ADAPTER CANDIDATE**, do not substitute for required Alibaba OCR / PStack review panel (superseded: the former TypeSafe Jev gate was waived by `GD-2026-10-21-REVIEW-STACK`) |
| [Olax](https://github.com/TheHalfMoon/Olax) | Company/agent decision workflows | **OUT OF CORE**, no reason to import for design discovery |

Private repos (when accessible) require the **same** exact source, right-to-disclose, per-path manifest, and no-secret checks. No automatic import from private code into this **public** Skilit repository.

## Explicit reject/defer choices

- **Do not use Mobbin, commercial screenshot-site scraping, or undocumented datasets as a shortcut** to building a rights-cleared corpus; third-party UI captures do not become redistributable simply because technically reachable.
- **Do not import an entire monorepo** to gain one icon picker, registry endpoint or OAuth flow. A small wrapper and exact upstream SDK are usually cheaper to maintain.
- **Do not introduce a second graph database, object store, auth authority, or search contract** because a donor bundles one. Skilit owns its canonical data.
- **Do not build a new Figma-class editor**; design handoff via OpenPencil/Lilac is a post-core integration.
- **Do not require hosted Firecrawl, paid inference, cloud GPU, mobile farm, or always-on vector search** to qualify the first functional app.
- **Do not use copied donor product branding or hardcoded donor redirects**; quarantine and adapt them in English under separate exact-grain review.
- **Do not introduce extra LLM reasoning providers for deterministic metadata extraction** until benchmark proves measurable benefit.

## Mandatory reusable-source scorecard

Before every donor acceptance, record numeric/qualitative evidence for:

1. **Capability coverage:** which exact user/API journey and contract fixtures it satisfies.
2. **Code existence:** runnable/reachable module and exact commit plus imported paths.
3. **Rights:** SPDX/license or scoped authorization; separately list datasets/assets/fonts/logos/weights/trademarks and notices.
4. **Integration cost:** direct transitive dependencies, platform assumptions, patch footprint, maintenance and portability.
5. **Safety:** URL egress, sandbox, arbitrary file access, prompt injection, secrets, vulnerabilities, dependency provenance.
6. **Quality:** deterministic tests, typecheck/build, runtime smoke, latency/memory and failure-mode fixtures.
7. **Vendor exit:** adapter replaceable without changing Skilit canonical identity, history or API schemas.
8. **Ownership:** keeper, upstream pin, update cadence, security response and rollback path.

States: `discovered -> rights_checked -> source_verified -> contract_qualified -> integrated -> launch_qualified`; `blocked` or `rejected` on a failure. The original `planned/ready/imported` source lock remains authoritative for actual imports and must not be silently upgraded by this research table.

## Sources reviewed

- [MCP 2026-07-28 spec release](https://blog.modelcontextprotocol.io/posts/2026-07-28/) — stateless core, Tasks extension, auth hardening.
- [MCP 2026-07-28 authorization](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/index.mdx) — protected resource metadata and audience-binding.
- [Official MCP Apps SDK](https://github.com/modelcontextprotocol/ext-apps) — UI extension and sandboxed resources.
- [Dembrandt](https://github.com/dembrandt/dembrandt) — design tokens and CSS extraction.
- [shadcn registry directory](https://ui.shadcn.com/docs/registry/registry-index) — public registry contract/validation.
- [Iconify collections](https://github.com/iconify/icon-sets/blob/master/collections.md) — **per collection** rights.
- [Fontsource](https://github.com/fontsource/fontsource) — **per font** license.
- [pg-boss](https://github.com/timgit/pg-boss) — PostgreSQL job queue.
- [OpenPencil](https://github.com/open-pencil/open-pencil) — edit/export via CLI and MCP.

This research snapshot does not pin external HEADs or imply that any listed candidate is already approved for source copying. Exact pinning happens at the implementation gate.
