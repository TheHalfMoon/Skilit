import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from scripts.ci_hygiene import (
    check_expected_head,
    check_files,
    check_repository,
    run_git,
)

ROOT = Path(__file__).resolve().parents[1]


class CIHygieneTests(unittest.TestCase):
    def _temp_root(self):
        return tempfile.TemporaryDirectory()

    def test_current_repository_hygiene_is_valid(self) -> None:
        self.assertEqual([], check_repository(ROOT))

    def test_exact_head_accepts_current_head_and_rejects_mismatch(self) -> None:
        actual = run_git(ROOT, "rev-parse", "HEAD").strip()
        self.assertEqual([], check_expected_head(ROOT, actual))
        errors = check_expected_head(ROOT, "0" * 40)
        self.assertTrue(any("exact-head mismatch" in error for error in errors), errors)

    def test_exact_head_requires_full_sha(self) -> None:
        self.assertTrue(check_expected_head(ROOT, "main"))

    def test_broken_markdown_link_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            readme = root / "README.md"
            readme.write_text("[missing](docs/missing.md)\n", encoding="utf-8")
            errors = check_files(root, [readme], required_paths=None)
        self.assertTrue(any("broken relative link" in error for error in errors), errors)

    def test_valid_markdown_file_and_directory_links_pass(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            docs = root / "docs"
            docs.mkdir()
            target = docs / "guide.md"
            target.write_text("# Guide\n", encoding="utf-8")
            readme = root / "README.md"
            readme.write_text("[file](docs/guide.md) [dir](docs/)\n", encoding="utf-8")
            self.assertEqual([], check_files(root, [readme, target], required_paths=None))

    def test_parent_relative_markdown_link_passes(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            readme = root / "README.md"
            readme.write_text("# Root\n", encoding="utf-8")
            docs = root / "docs"
            docs.mkdir()
            guide = docs / "guide.md"
            guide.write_text("[root](../README.md)\n", encoding="utf-8")
            self.assertEqual([], check_files(root, [readme, guide], required_paths=None))

    def test_trailing_whitespace_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "bad.py"
            path.write_text("value = 1  \n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("trailing whitespace" in error for error in errors), errors)

    def test_nul_in_text_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "bad.txt"
            path.write_bytes(b"safe\x00unsafe")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("NUL bytes" in error for error in errors), errors)

    def test_unknown_text_extension_gets_text_hygiene(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "module.mjs"
            path.write_text("export const value = 1;  \n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("trailing whitespace" in error for error in errors), errors)

    def test_extensionless_text_gets_text_hygiene(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "Dockerfile"
            path.write_bytes(b"FROM python:3.12\nRUN echo safe\x00unsafe\n")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("NUL bytes" in error for error in errors), errors)

    def test_known_binary_is_not_decoded_as_text(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "fixture.png"
            path.write_bytes(b"\x89PNG\x00\xfffixture")
            errors = check_files(root, [path], required_paths=None)
        self.assertEqual([], errors)

    def test_unknown_binary_like_file_fails_closed(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "payload.dat"
            path.write_bytes(b"opaque\x00payload")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("NUL bytes" in error for error in errors), errors)

    def test_non_utf8_text_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "bad.md"
            path.write_bytes(b"\xff\xfe\xfd")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("not valid UTF-8" in error for error in errors), errors)

    def test_invalid_yaml_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "broken.yml"
            path.write_text("root: [unterminated\n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("invalid YAML" in error for error in errors), errors)

    def test_duplicate_yaml_key_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "duplicate.yml"
            path.write_text("root:\n  value: 1\n  value: 2\n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("duplicate YAML key" in error for error in errors), errors)

    def test_empty_yaml_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "empty.yml"
            path.write_text("", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("empty YAML document" in error for error in errors), errors)

    def test_github_workflow_requires_on_and_jobs(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / ".github" / "workflows" / "bad.yml"
            path.parent.mkdir(parents=True)
            path.write_text("name: Missing contracts\n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("missing top-level 'on'" in error for error in errors), errors)
        self.assertTrue(any("missing top-level 'jobs'" in error for error in errors), errors)

    def test_github_workflow_requires_nonempty_jobs_and_trigger(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / ".github" / "workflows" / "bad.yml"
            path.parent.mkdir(parents=True)
            path.write_text("name: Bad\non:\njobs: {}\n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("'on' must not be null" in error for error in errors), errors)
        self.assertTrue(any("'jobs' must be a non-empty mapping" in error for error in errors), errors)

    def test_current_workflow_yaml_contract_is_valid(self) -> None:
        path = ROOT / ".github" / "workflows" / "ci.yml"
        self.assertEqual([], check_files(ROOT, [path], required_paths=None))

    def test_invalid_json_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "bad.json"
            path.write_text("{bad json", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("invalid JSON" in error for error in errors), errors)

    def test_duplicate_json_key_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "duplicate.json"
            path.write_text('{"value": 1, "value": 2}\n', encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("duplicate JSON key" in error for error in errors), errors)

    def test_missing_tracked_path_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "missing.txt"
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("tracked path is missing from checkout" in error for error in errors), errors)

    def test_tracked_symlink_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "linked.txt"
            path.write_text("safe\n", encoding="utf-8")
            with patch.object(Path, "is_symlink", return_value=True):
                errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("tracked symlink is forbidden" in error for error in errors), errors)

    def test_total_tracked_size_limit_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            first = root / "a.txt"
            second = root / "b.txt"
            first.write_bytes(b"a" * 20)
            second.write_bytes(b"b" * 20)
            errors = check_files(
                root,
                [first, second],
                max_file_bytes=100,
                max_tracked_total_bytes=30,
                required_paths=None,
            )
        self.assertTrue(any("tracked repository total exceeds 30 bytes" in error for error in errors), errors)

    def test_oversized_file_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "large.txt"
            path.write_bytes(b"x" * 17)
            errors = check_files(root, [path], max_file_bytes=16, required_paths=None)
        self.assertTrue(any("file exceeds 16 bytes" in error for error in errors), errors)

    def test_oversized_binary_file_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "large.png"
            path.write_bytes(b"x" * 17)
            errors = check_files(
                root,
                [path],
                max_file_bytes=100,
                max_binary_file_bytes=16,
                max_binary_total_bytes=100,
                required_paths=None,
            )
        self.assertTrue(any("binary/media file exceeds 16 bytes" in error for error in errors), errors)

    def test_binary_aggregate_limit_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            first = root / "a.png"
            second = root / "b.webp"
            first.write_bytes(b"a" * 20)
            second.write_bytes(b"b" * 20)
            errors = check_files(
                root,
                [first, second],
                max_file_bytes=100,
                max_binary_file_bytes=100,
                max_binary_total_bytes=30,
                required_paths=None,
            )
        self.assertTrue(any("binary/media total exceeds 30 bytes" in error for error in errors), errors)

    def test_generated_cache_paths_fail(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            cache = root / "graft"
            cache.mkdir()
            path = cache / "graph.json"
            path.write_text(json.dumps({"nodes": []}), encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("forbidden generated/cache path" in error for error in errors), errors)

    def test_review_tool_skill_install_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            skills = root / ".claude" / "skills"
            skills.mkdir(parents=True)
            path = skills / "ps-review.md"
            path.write_text("# review skill\n", encoding="utf-8")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("forbidden generated/cache path" in error for error in errors), errors)

    def test_python_bytecode_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "module.pyc"
            path.write_bytes(b"bytecode")
            errors = check_files(root, [path], required_paths=None)
        self.assertTrue(any("forbidden generated bytecode" in error for error in errors), errors)

    def test_required_path_missing_fails(self) -> None:
        with self._temp_root() as tmp:
            root = Path(tmp)
            path = root / "README.md"
            path.write_text("# Test\n", encoding="utf-8")
            errors = check_files(root, [path], required_paths={"GOVERNANCE.md"})
        self.assertTrue(any("required tracked path missing" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
