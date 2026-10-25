# P10-G28 — Bounded SVG attribute and dimension guards

**Scope:** Six pre-existing CodeQL `js/polynomial-redos` alerts: #11–#13 (`vector-adapter.ts`) and #14–#16 (`openpencil-adapter.ts`), detected on the pre-PR protected main SHA `157ace7`.

Both local-only adapters previously inspected incoming SVG text with two unanchored `/<svg[^>]*.../` dimension searches and `/on[a-z]+\s*=/i` for unsafe event-handler attributes. CodeQL identified potentially quadratic behavior on repeated prefixes. SVG outputs are already constrained by byte budgets, but worst-case parsing should not consume disproportionate CPU.

## Change
- One shared Skilit-owned `svg-guard.ts` helper performs a bounded, linear scan for event-handler attributes without overlapping backtracking groups.
- SVG root dimensions are parsed from opening tag attributes without unbounded multi-start regular expressions. Numeric values must have decimal digits, optional one decimal point followed by digits and closing quote. Both dimensions must be present in a valid opening tag.
- Uses length-preserving ASCII case folding so Unicode in neighboring attributes does not corrupt character offsets.
- Existing output size limits, active-content denylists, invalid dimension refusal, confinement, licensing, no-egress requirements and subprocess permissions remain in the two adapters.

## Local evidence
- Entire editor-adapters test suite **73 passed / 1 pre-existing binary-dependent skip / 0 failures**.
- Four focused SVG helper tests pass, covering event-handler denial in both adapters, valid and malformed dimensions, 2,000 deterministic synthetic equivalence trials for event detection, large repeated prefixes, and Unicode case-folding alignment.
- Editor-adapters strict TypeScript, ESLint, `ci_hygiene.py` and Graft 0.21.1 build/check pass. GitHub exact-head CI and CodeQL analysis still must be verified after creating the PR.
- Only synthetic SVG fixtures were used. No external binary download, inference API, model, or payment.

## Security qualification
This helper is **not a complete XML/SVG sanitizer** and does not certify SVG content safe for direct HTML embedding; it preserves the original adapter denylists under bounded parsing. CodeQL rule disappearance on this branch, if observed, will not prove the absence of other parser vulnerabilities. Independent PStack correctness/parsimony/product/security review remains mandatory; no merge, deployment, release or publication is authorized by this change.
