"""No network, no imported competitor content, no fake production scores."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / "scripts/score_competitive_benchmark.py"
spec = importlib.util.spec_from_file_location("skilit_competitive_score", MODULE)
score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)
MANIFEST = Path(__file__).resolve().parents[1] / "docs/research/competitive/tasks.json"


def example(tid="CB01-01", product="skilit", evaluator="human-01"):
    return {
        "task_id": tid,
        "product": product,
        "evaluator": evaluator,
        "status": "completed",
        "access_tier": "free",
        "method": "synthetic unit-test fixture; not a real competitor observation",
        "evidence_url": "https://example.invalid/test-only",
        "rubric": {"relevance": 4, "evidence": 3, "actionability": 2, "reproducibility": 4},
        "elapsed_seconds": 12,
        "human_steps": 2,
    }


class CompetitiveBenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = score.load_manifest(MANIFEST)

    def test_manifest_is_stratified_50(self):
        self.assertEqual(len(self.manifest["tasks"]), 50)
        self.assertEqual(sum(t["comparison"] == "shared" for t in self.manifest["tasks"]), 30)
        self.assertEqual(len({t["domain"] for t in self.manifest["tasks"]}), 10)

    def test_unmeasured_is_not_a_win_or_a_loss(self):
        summary = score.summarize(self.manifest, [])
        self.assertEqual(summary["paired_shared_tasks_with_two_raters_each"], 0)
        self.assertEqual(summary["measurement_state"], "insufficient-comparable-evidence")
        self.assertEqual(summary["products"]["skilit"]["quality_mean_observed_only"], None)
        self.assertIn("NOT ESTABLISHED", summary["superiority_claim"])

    def test_partial_observation_not_implicitly_zero(self):
        rows = [example()]
        summary = score.summarize(self.manifest, rows)
        self.assertEqual(summary["products"]["skilit"]["completed_observations"], 1)
        self.assertEqual(summary["products"]["mobbin"]["completed_observations"], 0)
        self.assertIsNone(summary["products"]["mobbin"]["quality_mean_observed_only"])
        self.assertEqual(summary["paired_shared_tasks_with_two_raters_each"], 0)

    def test_matching_two_raters_counts_one_paired_task_not_a_win(self):
        rows = [example(product=p, evaluator=e) for p in score.PRODUCTS
                for e in ("blind-rater-A", "blind-rater-B")]
        summary = score.summarize(self.manifest, rows)
        self.assertEqual(summary["paired_shared_tasks_with_two_raters_each"], 1)
        self.assertEqual(
            summary["exploratory_matched_subset"]["skilit"]["matched_task_mean_quality_0_to_4"],
            3.25,
        )
        self.assertIn("NOT ESTABLISHED", summary["superiority_claim"])

    def test_different_access_tiers_not_paired(self):
        rows = [example(product=p, evaluator=e) for p in score.PRODUCTS
                for e in ("blind-rater-A", "blind-rater-B")]
        rows[-1]["access_tier"] = "existing_entitlement"
        summary = score.summarize(self.manifest, rows)
        self.assertEqual(summary["paired_shared_tasks_with_two_raters_each"], 0)

    def test_unknown_access_tier_never_qualifies_for_pairing(self):
        rows = [example(product=p, evaluator=e) for p in score.PRODUCTS
                for e in ("blind-rater-A", "blind-rater-B")]
        for row in rows:
            row["access_tier"] = "unknown"
        summary = score.summarize(self.manifest, rows)
        self.assertEqual(summary["paired_shared_tasks_with_two_raters_each"], 0)

    def test_nonfinite_times_and_nonfinite_json_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "obs.json"
            record = example()
            record["elapsed_seconds"] = float("inf")
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                     "observations": [record]}))
            with self.assertRaisesRegex(ValueError, "non-finite JSON"):
                score.load_observations(p, self.manifest)
            record["elapsed_seconds"] = float("nan")
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                     "observations": [record]}))
            with self.assertRaisesRegex(ValueError, "non-finite JSON"):
                score.load_observations(p, self.manifest)

    def test_completed_trial_rejects_blocked_access_or_bad_evidence_link(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "obs.json"
            record = example()
            record["access_tier"] = "blocked"
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                     "observations": [record]}))
            with self.assertRaisesRegex(ValueError, "confirmed usable access"):
                score.load_observations(p, self.manifest)
            record["access_tier"] = "free"
            record["evidence_url"] = "https://user:secret@example.invalid/hidden"
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                     "observations": [record]}))
            with self.assertRaisesRegex(ValueError, "credential-bearing"):
                score.load_observations(p, self.manifest)
            record["evidence_url"] = "http://example.invalid/unsafe"
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                     "observations": [record]}))
            with self.assertRaisesRegex(ValueError, "HTTPS"):
                score.load_observations(p, self.manifest)

    def test_blocked_status_requires_blocked_tier(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "obs.json"
            record = example()
            record["status"] = "access_blocked"
            record.pop("rubric")
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                     "observations": [record]}))
            with self.assertRaisesRegex(ValueError, "access_tier=blocked"):
                score.load_observations(p, self.manifest)

    def test_invalid_score_and_unscored_failure_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "obs.json"
            obj = {"schema_version": "skilit-competitive-observations/1", "observations": [example()]}
            obj["observations"][0]["rubric"]["relevance"] = 9
            p.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ValueError, "scores"):
                score.load_observations(p, self.manifest)
            obj["observations"][0]["status"] = "access_blocked"
            obj["observations"][0]["rubric"]["relevance"] = 0
            p.write_text(json.dumps(obj))
            with self.assertRaisesRegex(ValueError, "cannot carry scored"):
                score.load_observations(p, self.manifest)

    def test_duplicate_evaluator_not_independent(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "obs.json"
            p.write_text(json.dumps({"schema_version": "skilit-competitive-observations/1",
                                    "observations": [example(), example()]}))
            with self.assertRaisesRegex(ValueError, "duplicate"):
                score.load_observations(p, self.manifest)


if __name__ == "__main__":
    unittest.main()
