# P10-G27 — Bearer parser time-bound hardening

**Status:** independent security-review candidate; not a release or merge approval.

GitHub's new free public-repository CodeQL extended scan surfaced a pre-existing baseline `js/polynomial-redos` alert **#10** at `apps/web/lib/mcp.ts` in the `bearerToken` parser. The old anchored regex `/^Bearer\s+(.+)$/i` had two adjacent variable-width matches over potentially repeated whitespace. CodeQL flags polynomial backtracking on attacker-influenced request header strings. This finding was first reported on protected main SHA `157ace7` and is **not** a new issue introduced by P10-G26.

The change uses a simple bounded prefix scan and requires a separating whitespace character, then extracts the remainder as the token. It rejects headers longer than 8192 characters **before** allocation/trim and rejects CR/LF anywhere (HTTP header injection/multiline credentials). It does not log tokens or change cookie authentication, session hashing, storage, REST/MCP error envelopes, or permissions.

**Local regression:** the existing bearer test + oversized, multiline and malformed variants passes; 28/28 session/MCP/interop transport tests passed on isolated PGlite. Web TypeScript and ESLint and `ci_hygiene.py` PASS.

**Risk and limitations:** this is a conservative parser hardening, not evidence that the flagged regex was exploitable through a valid HTTP header or that the whole product is secure. Re-run exact-head GitHub CI and CodeQL. Other pre-existing CodeQL alerts remain, including alert #26 on OpenPencil's operator-configured executable and #25 on bundled migration SQL, both of which require accurate trust-boundary triage rather than treating severity labels alone as confirmed exploits.

**Governance:** CodeQL does not substitute for mandatory independent PStack four-bar security review. Keep Draft; no deploy, tag, publication, release, costed model or API.
