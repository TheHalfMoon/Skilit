# Skilit — local synthetic search baseline (2026-10-24)

**Scope:** real execution of the existing benchmark, **not** a comparison with Mobbin, Refero or Page Flows. There are **zero real competitor trials**, no judged real-world screen dataset, and no proof of market superiority.

**Command on authorized `macbook`:**

```sh
node --experimental-strip-types scripts/bench_search.mjs --records 200 --iterations 25
```

- Source: `main` commit `157ace7fc57aae9e135a368b7bbe1829ae7111ae`, executed in a detached candidate worktree sharing that runtime code.
- Node: v26.0.0; engine: embedded PGlite, PostgreSQL full-text search, **synthetic-200-records** (no external corpus/assets/models).
- Host: Mac with 8 GiB memory. Hardware/OS state and cache can change numbers; this is one run, not a service-level objective or formal multi-run benchmark.
- No user secrets, paid models, paid services, cloud database or external network calls.

| Query | Facets | Iterations | p50 (ms) | p95 (ms) | Maximum (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| `arrow` | off | 25 | 3.27 | 3.45 | 3.47 |
| `arrow` | on | 25 | 5.18 | 5.44 | 5.50 |
| `bench arrow` | off | 25 | 3.19 | 3.24 | 3.25 |
| `tag-5` | off | 25 | 1.95 | 2.01 | 2.06 |

This confirms only that Skilit's **local deterministic asset search** runs in the synthetic harness. It does not measure design-screen corpus search quality, visual embeddings, multi-user load, production PostgreSQL, or the 50 competitive user research tasks. Those require separate rights-cleared and adjudicated evidence. No marketing speed claim may generalize these numbers.
