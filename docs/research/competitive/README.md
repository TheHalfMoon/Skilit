# Skilit Competitive Intelligence & Benchmark — experiment protocol v1

**Status: DESIGN + VALIDATED EMPTY BASELINE.** No competitor trials have been performed by this package. There is no evidence yet that Skilit outperforms Mobbin, Refero, or Page Flows. This research does not change the completed **v1 Local** contract, does not create a release/tag/deployment, and does not authorize paid services.

**Pinned engineering reference:** Skilit `main` at `157ace7fc57aae9e135a368b7bbe1829ae7111ae` (2026-10-22). Re-pin before any later run.

## What is established versus what needs a test

| Product | Official/public research claim (not independently validated) | Competitive implication | Source |
| --- | --- | --- | --- |
| Skilit | Local Lens URL → evidence-grounded report and Build Kit; REST + 30 MCP tools; deterministic lexical similarity; replay, but not live capture | Demonstrates a technical *capability*, not a superior customer experience or corpus | [Skilit v1 Local contract](../../qualification/V1_LOCAL_ACCEPTANCE_CONTRACT.md), [readiness](../../qualification/V1_LOCAL_RELEASE_READINESS.md) |
| Mobbin | 621,500+ real product screens, flows and UI references; remote MCP is available on Pro/Team | Strong scale and agent-research incumbent; full MCP trial could require payment | https://mobbin.com/ and https://mobbin.com/mcp |
| Refero | Product screens, flows, semantic style search, research mode and a remote MCP (Pro) | Strong search/research competitor; full MCP trial could require payment | https://refero.design/ and https://refero.design/mcp |
| Page Flows | User-journey references and flow playback | Flow-reference context for future expansion, **not included** in the primary 3-product paired scoring | https://pageflows.com/ |

These are vendor/public claims; do not label vendor-reported library counts as independently measured benchmarks. The core difference worth **testing**, not assuming, is the conversion from a source reference or analyzed URL to a reproducible developer-facing artifact with preserved provenance.

## Pre-registered tasks and lanes

The controlled case bank is `tasks.json`: **50 original tasks**, ten domains sampled evenly per lane. None requires copying competitors' protected asset bytes into this repository.

- **Shared head-to-head lanes (30 cases):** discover design references, inspect user flows, compare design patterns. These test retrieval quality and grounded UX research.
- **Capability-differentiation lanes (20 cases):** programmatic agent retrieval and reference-to-Build-Kit handoff. These measure *coverage and execution*, not a winner when products offer different scopes.

The ten domains are fintech, healthcare, commerce, productivity, travel, education, creator, customer support, developer tools, and community. Prompts are identical across the compared products. Test order must be shuffled for reviewers, but IDs are frozen. Add new tasks only as a versioned experiment, not after seeing outcomes.

## Study design (no paid calls)

1. **Access audit:** record each product's genuinely available `free` or already-owned `existing_entitlement` tier, authentication requirements, usage limits, access date, and allowed extraction. Never purchase a Pro/Team plan or route around a paywall to complete the benchmark. If access is unavailable, record `access_blocked` and leave it unscored.
2. **Comparable environment:** use the same task prompt, time budget, connectivity policy, screen size (1440×900 for browser tasks), and request sequence for each product. Use the supported native interaction mode of each product; **record** whether it is UI, MCP, or local REST and do not pass off interface differences as identical experiences.
3. **Independent graders:** at least **two distinct blinded evaluators** per completed product/task. Judges must receive the task, produced references and permitted output evidence; hide product names and presentation chrome when practical. Preserve independently dated judgments rather than copying other judges' grades.
4. **Rubric:** each completed observation gets integer **0–4** ratings on relevance (matched user intent), evidence (verifiable source and no hallucinated citations), actionability (usable UX guidance or functioning artifact), and reproducibility (re-run trace or demonstrably stable artifact). Report each axis; their unweighted mean is a *descriptive*, not validated market success metric.
5. **Efficiency and guardrails:** measure time to supported result in seconds, human interventions, total out-of-pocket cost (must remain zero), rights/provenance coverage, incorrect/unjustified assertions, security regressions and evaluation failure rate. Never introduce a production token or real end-user data to a test.
6. **Partial/blocked outcomes:** use `partial`, `unsupported`, `access_blocked`, `error` when applicable; these outcomes have **no invented quality score**. State feature coverage separately; never score unavailable access as a competitor defeat.
7. **Paired analysis:** only consider direct comparison of the 30 shared tasks where **all three** products have two independent scored observations each, under the **same access tier**. Report uncertainty, task-level errors and stratified domains. If any of the 30 lack matching data, state **insufficient comparable evidence**; subset analysis may be exploratory but cannot support an unqualified headline win.
8. **Independent adjudication:** even complete paired data is not an automatic superiority claim. Inspect failure cases, relevance blind spots, material differences in product capabilities/tier, and inter-rater disagreement. Re-run disputed tasks without changing the rubric.

The **primary outcomes** are task success with grounded and actionable design references, and median time to useful output. **The guardrails** are source/rights integrity, privacy/security, evaluation completeness, and zero founder cost. The agent-to-Build-Kit lane is a separate differentiated outcome, with reproducible artifact success as its primary metric.

## Reproducible local commands

```sh
python3 -m unittest discover -s tests -p 'test_competitive_benchmark.py' -v
python3 scripts/score_competitive_benchmark.py
python3 scripts/score_competitive_benchmark.py \
  --observations docs/research/competitive/observations.template.json \
  --out /tmp/skilit-competitive-scorecard.json
```

The empty template contains **no fake observations**. The scorecard must say `insufficient-comparable-evidence` and `NOT ESTABLISHED`. Do not commit a report asserting market performance until there is genuine trial evidence.

A completed observation uses:

```json
{
  "task_id": "CB01-01",
  "product": "skilit",
  "evaluator": "independent-judge-A",
  "status": "completed",
  "access_tier": "free",
  "method": "exact user action/tool invocation and environment",
  "evidence_url": "https://example.org/link-to-permitted-redacted-evidence",
  "rubric": {
    "relevance": 0,
    "evidence": 0,
    "actionability": 0,
    "reproducibility": 0
  },
  "elapsed_seconds": 0,
  "human_steps": 0
}
```

**The JSON above is a format illustration, not a trial.** For a blocked observation: omit the `rubric`, state `status: "access_blocked"`, preserve method, and set `access_tier: "blocked"`. Document access restrictions in `method`. Never record API keys, raw session tokens, private customer data, copyrighted image files without permission, or account identifiers in GitHub.

## What comes after this preparation

- Verify actual access entitlements for competitors and collect only permitted, direct product observations.
- Conduct a small **five-case pilot** using the frozen shared tasks to calibrate the rubric and identify method bias. A pilot is not 50-case evidence.
- Run the full 30-case shared lane after access is available; then do the 20-case differentiation study.
- Publish *within the repo only* a reviewer-auditable comparison report with citations, measured costs/times, failure cases, and stated limitations. Never publish a public Skilit release/tag/deployment from this research.
- Treat user-interface improvements, bigger rights-cleared corpora, visual search and live capture as **potential follow-on engineering**, only if measurements demonstrate gaps and the founder approves changes outside v1 Local.
