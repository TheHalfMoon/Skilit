#!/usr/bin/env python3
"""Evidence-first descriptive competitive scorecard. Stdlib-only, no network or paid APIs.

No superiority conclusion is emitted automatically. Results are only comparable
for shared tasks with a minimum of two distinct independent raters per product.
Unavailable trials are never silently scored as zero.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
import math
from urllib.parse import urlsplit
from pathlib import Path
import statistics
from typing import Any

LANES = (
    "reference_discovery",
    "flow_investigation",
    "pattern_comparison",
    "agent_research",
    "design_to_build",
)
PRODUCTS = ("skilit", "mobbin", "refero")
STATUSES = ("completed", "partial", "unsupported", "access_blocked", "error")
RUBRIC = ("relevance", "evidence", "actionability", "reproducibility")


def _required(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_strict_json(path: Path) -> Any:
    # JSON permits only finite numeric values; Python's default parser also
    # accepts NaN/Infinity, which would corrupt benchmarks and reports.
    def reject_constant(value: str) -> None:
        raise ValueError(f"non-finite JSON number rejected: {value}")

    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)


def evidence_url_allowed(value: Any) -> bool:
    # Evidence is a reference only; this tool never fetches it. Disallow
    # credentials in URL authority and insecure links in shared records.
    if not isinstance(value, str) or not value.startswith("https://"):
        return False
    try:
        url = urlsplit(value)
        return (
            url.scheme == "https" and bool(url.hostname)
            and url.username is None and url.password is None
            and not any(ord(ch) < 32 for ch in value)
        )
    except ValueError:
        return False


def load_manifest(path: Path) -> dict[str, Any]:
    data = read_strict_json(path)
    _required(isinstance(data, dict), "manifest must be an object")
    _required(data.get("schema_version") == "skilit-competitive-tasks/1", "unknown manifest version")
    _required(data.get("products") == list(PRODUCTS), "product set/order changed")
    tasks = data.get("tasks")
    _required(isinstance(tasks, list) and len(tasks) == 50, "manifest must include exactly 50 tasks")
    seen: set[str] = set()
    for task in tasks:
        _required(isinstance(task, dict), "task must be an object")
        tid = task.get("task_id")
        _required(isinstance(tid, str) and tid not in seen, "task_id missing/duplicated")
        seen.add(tid)
        lane = task.get("lane")
        _required(lane in LANES, f"{tid}: unrecognized lane")
        expected = "shared" if lane in LANES[:3] else "differentiator"
        _required(task.get("comparison") == expected, f"{tid}: comparison lane mismatch")
        for attr in ("domain", "prompt", "expected_artifacts", "pass_criteria"):
            _required(isinstance(task.get(attr), str) and bool(task[attr].strip()), f"{tid}: {attr} missing")
    _required(Counter(x["lane"] for x in tasks) == Counter({x: 10 for x in LANES}), "expected 10 cases per lane")
    _required(len({t["domain"] for t in tasks}) == 10, "expected 10 domain strata")
    _required(all(Counter(t["domain"] for t in tasks if t["lane"] == lane) ==
                  Counter(t["domain"] for t in tasks if t["lane"] == LANES[0])
                  for lane in LANES), "domain strata are imbalanced")
    return data


def load_observations(path: Path | None, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    if path is None:
        return []
    obj = read_strict_json(path)
    _required(isinstance(obj, dict) and obj.get("schema_version") == "skilit-competitive-observations/1",
              "unknown observation schema")
    records = obj.get("observations")
    _required(isinstance(records, list), "observations must be an array")
    valid_ids = {t["task_id"] for t in manifest["tasks"]}
    seen: set[tuple[str, str, str]] = set()
    for i, rec in enumerate(records):
        _required(isinstance(rec, dict), f"record {i}: must be object")
        tid, product, evaluator = rec.get("task_id"), rec.get("product"), rec.get("evaluator")
        _required(tid in valid_ids, f"record {i}: unknown task_id")
        _required(product in PRODUCTS, f"record {i}: invalid product")
        _required(isinstance(evaluator, str) and len(evaluator.strip()) >= 3,
                  f"record {i}: independent evaluator ID required")
        key = (tid, product, evaluator)
        _required(key not in seen, f"record {i}: duplicate task/product/evaluator")
        seen.add(key)
        status = rec.get("status")
        _required(status in STATUSES, f"record {i}: invalid status")
        _required(rec.get("access_tier") in ("free", "existing_entitlement", "blocked", "unknown"),
                  f"record {i}: missing access tier")
        _required(isinstance(rec.get("method"), str) and bool(rec["method"].strip()),
                  f"record {i}: method not documented")
        if status == "completed":
            _required(rec["access_tier"] in ("free", "existing_entitlement"),
                      f"record {i}: completed trials require confirmed usable access")
            score = rec.get("rubric")
            _required(isinstance(score, dict) and set(score) == set(RUBRIC), f"record {i}: incomplete rubric")
            _required(all(type(score[k]) is int and 0 <= score[k] <= 4 for k in RUBRIC),
                      f"record {i}: scores must be integers 0..4")
            _required(evidence_url_allowed(rec.get("evidence_url")),
                      f"record {i}: invalid or credential-bearing HTTPS evidence URL")
            seconds = rec.get("elapsed_seconds")
            _required(type(seconds) in (int, float) and math.isfinite(seconds) and seconds >= 0,
                      f"record {i}: elapsed_seconds must be finite and nonnegative")
            steps = rec.get("human_steps")
            _required(type(steps) is int and steps >= 0, f"record {i}: invalid human_steps")
        else:
            _required("rubric" not in rec, f"record {i}: blocked/partial/error cases cannot carry scored quality")
            if status == "access_blocked":
                _required(rec["access_tier"] == "blocked",
                          f"record {i}: access-blocked trials need access_tier=blocked")
    return records


def summarize(manifest: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    by_product: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_task: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for rec in records:
        by_product[rec["product"]].append(rec)
        by_task[rec["task_id"]][rec["product"]].append(rec)
    products = {}
    for product in PRODUCTS:
        recs = by_product[product]
        success = [r for r in recs if r["status"] == "completed"]
        products[product] = {
            "observations": len(recs),
            "status_counts": dict(sorted(Counter(r["status"] for r in recs).items())),
            "completed_observations": len(success),
            "quality_mean_observed_only": (round(statistics.mean(
                statistics.mean(r["rubric"].values()) for r in success), 3) if success else None),
            "median_seconds_observed_only": (round(statistics.median(
                r["elapsed_seconds"] for r in success), 2) if success else None),
        }
    shared_ids = [x["task_id"] for x in manifest["tasks"] if x["comparison"] == "shared"]
    complete_pairs: list[str] = []
    for tid in shared_ids:
        # All three products must have two independently graded, successful
        # responses *and* equal access tiers. Missing is not a loss.
        group = by_task[tid]
        if not all(len([r for r in group[p] if r["status"] == "completed"]) >= 2 for p in PRODUCTS):
            continue
        access = {r["access_tier"] for p in PRODUCTS for r in group[p] if r["status"] == "completed"}
        if len(access) != 1 or "unknown" in access or "blocked" in access:
            continue
        complete_pairs.append(tid)
    # Matched subset is explicitly exploratory unless all 30 shared cases
    # were independently completed under equal access conditions.
    paired_by_product: dict[str, dict[str, Any]] = {}
    for product in PRODUCTS:
        per_task = [
            [r for r in by_task[tid][product] if r["status"] == "completed"]
            for tid in complete_pairs
        ]
        # Each task weighs once even if more evaluators graded it.
        task_quality = [
            statistics.mean(statistics.mean(r["rubric"].values()) for r in group)
            for group in per_task
        ]
        task_times = [
            statistics.median(r["elapsed_seconds"] for r in group)
            for group in per_task
        ]
        paired_by_product[product] = {
            "matched_task_mean_quality_0_to_4": (
                round(statistics.mean(task_quality), 3) if task_quality else None
            ),
            "matched_task_median_elapsed_seconds": (
                round(statistics.median(task_times), 2) if task_times else None
            ),
        }
    full_coverage = len(complete_pairs) == len(shared_ids)
    return {
        "schema_version": "skilit-competitive-scorecard/1",
        "benchmark_task_count": len(manifest["tasks"]),
        "shared_task_count": len(shared_ids),
        "differentiator_task_count": len(manifest["tasks"]) - len(shared_ids),
        "paired_shared_tasks_with_two_raters_each": len(complete_pairs),
        "paired_task_ids": complete_pairs,
        "exploratory_matched_subset": paired_by_product,
        "measurement_state": ("shared-lane-fully-observed-descriptive-only" if full_coverage
                              else "insufficient-comparable-evidence"),
        "superiority_claim": "NOT ESTABLISHED — independent analysis is required",
        "products": products,
        "caveats": [
            "Unobserved/blocked/unsupported tasks are never silently scored as failures.",
            "Observed-only means are not comparable across products unless the task mix is matched.",
            "Do not compare paid versus free tiers without matched access conditions.",
            "Source-asset redistribution requires explicit rights; retain URLs/metadata only when permitted.",
            "No automatic win declaration; blinded adjudication and paired error analysis are separate gates.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path,
                        default=Path("docs/research/competitive/tasks.json"))
    parser.add_argument("--observations", type=Path,
                        help="JSON from independently conducted trials; omit for no-measurement baseline")
    parser.add_argument("--out", type=Path, help="write machine-readable summary JSON")
    args = parser.parse_args()
    manifest = load_manifest(args.manifest)
    observations = load_observations(args.observations, manifest)
    summary = summarize(manifest, observations)
    payload = json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding="utf-8")
    print(payload, end="")


if __name__ == "__main__":
    main()
