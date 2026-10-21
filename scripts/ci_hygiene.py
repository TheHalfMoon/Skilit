#!/usr/bin/env python3
"""Repository-level CI hygiene checks for Skilit bootstrap and future imports."""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml
from yaml.nodes import MappingNode, ScalarNode, SequenceNode

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TRACKED_TOTAL_BYTES = 100 * 1024 * 1024
MAX_BINARY_FILE_BYTES = 2 * 1024 * 1024
MAX_BINARY_TOTAL_BYTES = 25 * 1024 * 1024
BINARY_EXTENSIONS = {
    ".7z",
    ".bin",
    ".db",
    ".gif",
    ".ico",
    ".gz",
    ".jpeg",
    ".avif",
    ".jpg",
    ".mov",
    ".mp4",
    ".onnx",
    ".otf",
    ".parquet",
    ".pdf",
    ".png",
    ".safetensors",
    ".sqlite",
    ".tar",
    ".ttf",
    ".wasm",
    ".webm",
    ".webp",
    ".woff",
    ".woff2",
    ".zip",
}
FORBIDDEN_TRACKED_PARTS = {".claude", "__pycache__", "graft", "node_modules"}
FORBIDDEN_TRACKED_SUFFIXES = {".pyc", ".pyo"}
REQUIRED_PATHS = {
    ".github/workflows/ci.yml",
    "ARCHITECTURE.md",
    "CODE_PROVENANCE.md",
    "DATA_PROVENANCE.md",
    "GOVERNANCE.md",
    "PRODUCT.md",
    "requirements-ci.txt",
    "SECURITY.md",
    "UPSTREAMS.lock.yml",
    "docs/IMPLEMENTATION_PLAN.md",
    "docs/operations/CI.md",
    "imports/monet-registry/manifest.json",
    "imports/monet-registry/source-tree.tsv",
    "schemas/upstreams.schema.json",
    "scripts/ci_hygiene.py",
    "scripts/validate_upstreams.py",
    "tests/test_ci_hygiene.py",
    "tests/test_monet_import_manifest.py",
}
MARKDOWN_LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def run_git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result.stdout


def tracked_files(root: Path) -> list[Path]:
    output = run_git(root, "ls-files", "-z")
    return [root / item for item in output.split("\0") if item]


def relative_posix(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def tracked_targets(root: Path, files: list[Path]) -> tuple[set[str], set[str]]:
    file_targets: set[str] = set()
    dir_targets: set[str] = set()
    for path in files:
        rel = Path(relative_posix(root, path))
        file_targets.add(rel.as_posix())
        for parent in rel.parents:
            if parent.as_posix() != ".":
                dir_targets.add(parent.as_posix())
    return file_targets, dir_targets


def markdown_link_errors(root: Path, path: Path, file_targets: set[str], dir_targets: set[str]) -> list[str]:
    errors: list[str] = []
    rel = Path(relative_posix(root, path))
    text = path.read_text(encoding="utf-8")
    for raw_target in MARKDOWN_LINK_RE.findall(text):
        target = raw_target.strip()
        if not target or target.startswith("#"):
            continue
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc:
            continue
        clean_path = unquote(parsed.path)
        if not clean_path:
            continue
        if clean_path.startswith("/"):
            candidate = Path(clean_path.lstrip("/"))
        else:
            candidate = rel.parent / clean_path
        normalized = posixpath.normpath(candidate.as_posix()).rstrip("/")
        if normalized not in file_targets and normalized not in dir_targets:
            errors.append(f"{rel.as_posix()}: broken relative link: {raw_target}")
    return errors


def yaml_duplicate_key_errors(node: object, rel_text: str, location: str = "$") -> list[str]:
    errors: list[str] = []
    if isinstance(node, MappingNode):
        seen: set[str] = set()
        for key_node, value_node in node.value:
            if isinstance(key_node, ScalarNode):
                key = key_node.value
                if key in seen:
                    errors.append(f"duplicate YAML key: {rel_text}:{location}.{key}")
                seen.add(key)
                child_location = f"{location}.{key}"
            else:
                child_location = f"{location}.<complex-key>"
            errors.extend(yaml_duplicate_key_errors(value_node, rel_text, child_location))
    elif isinstance(node, SequenceNode):
        for index, child in enumerate(node.value):
            errors.extend(yaml_duplicate_key_errors(child, rel_text, f"{location}[{index}]"))
    return errors


def yaml_errors(rel_text: str, text: str) -> list[str]:
    errors: list[str] = []
    try:
        node = yaml.compose(text, Loader=yaml.SafeLoader)
    except yaml.YAMLError as exc:
        return [f"invalid YAML: {rel_text}: {exc}"]

    if node is None:
        return [f"empty YAML document: {rel_text}"]

    errors.extend(yaml_duplicate_key_errors(node, rel_text))

    if rel_text.startswith(".github/workflows/"):
        if not isinstance(node, MappingNode):
            return errors + [f"GitHub workflow must be a YAML mapping: {rel_text}"]
        top_level = {
            key.value: value
            for key, value in node.value
            if isinstance(key, ScalarNode)
        }
        for required in ("on", "jobs"):
            if required not in top_level:
                errors.append(f"GitHub workflow missing top-level '{required}': {rel_text}")
        jobs = top_level.get("jobs")
        if jobs is not None and (not isinstance(jobs, MappingNode) or not jobs.value):
            errors.append(f"GitHub workflow 'jobs' must be a non-empty mapping: {rel_text}")
        on_value = top_level.get("on")
        if isinstance(on_value, ScalarNode) and on_value.tag.endswith(":null"):
            errors.append(f"GitHub workflow 'on' must not be null: {rel_text}")
    return errors


class DuplicateJSONKeyError(ValueError):
    pass


def strict_json_loads(text: str) -> object:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise DuplicateJSONKeyError(key)
            result[key] = value
        return result

    return json.loads(text, object_pairs_hook=reject_duplicates)


def check_expected_head(root: Path, expected_head: str | None) -> list[str]:
    if not expected_head:
        return []
    expected = expected_head.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", expected):
        return ["EXPECTED_HEAD must be a full 40-hex commit SHA"]
    actual = run_git(root, "rev-parse", "HEAD").strip().lower()
    if actual != expected:
        return [f"exact-head mismatch: expected {expected}, got {actual}"]
    return []


def check_files(
    root: Path,
    files: list[Path],
    *,
    max_file_bytes: int = MAX_FILE_BYTES,
    max_tracked_total_bytes: int = MAX_TRACKED_TOTAL_BYTES,
    max_binary_file_bytes: int = MAX_BINARY_FILE_BYTES,
    max_binary_total_bytes: int = MAX_BINARY_TOTAL_BYTES,
    required_paths: set[str] | None = REQUIRED_PATHS,
) -> list[str]:
    errors: list[str] = []
    binary_total = 0
    tracked_total = 0
    file_targets, dir_targets = tracked_targets(root, files)

    if required_paths is not None:
        missing = sorted(required_paths - file_targets)
        for rel in missing:
            errors.append(f"required tracked path missing: {rel}")

    for path in files:
        rel = Path(relative_posix(root, path))
        rel_text = rel.as_posix()
        if any(part in FORBIDDEN_TRACKED_PARTS for part in rel.parts):
            errors.append(f"forbidden generated/cache path is tracked: {rel_text}")
        if path.suffix.lower() in FORBIDDEN_TRACKED_SUFFIXES:
            errors.append(f"forbidden generated bytecode is tracked: {rel_text}")
        if path.is_symlink():
            errors.append(f"tracked symlink is forbidden: {rel_text}")
            continue
        if not path.exists():
            errors.append(f"tracked path is missing from checkout: {rel_text}")
            continue
        if not path.is_file():
            errors.append(f"tracked path is not a regular file: {rel_text}")
            continue

        size = path.stat().st_size
        tracked_total += size
        oversized = size > max_file_bytes
        if oversized:
            errors.append(f"file exceeds {max_file_bytes} bytes: {rel_text} ({size})")

        suffix = path.suffix.lower()
        is_binary = suffix in BINARY_EXTENSIONS
        if is_binary:
            binary_total += size
            if size > max_binary_file_bytes:
                errors.append(f"binary/media file exceeds {max_binary_file_bytes} bytes: {rel_text} ({size})")

        if oversized:
            continue

        if not is_binary:
            raw = path.read_bytes()
            if b"\x00" in raw:
                errors.append(f"text file contains NUL bytes: {rel_text}")
                continue
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                errors.append(f"text file is not valid UTF-8: {rel_text}")
                continue
            for line_number, line in enumerate(text.splitlines(), start=1):
                if line.endswith(" ") or line.endswith("\t"):
                    errors.append(f"trailing whitespace: {rel_text}:{line_number}")
            if suffix == ".json":
                try:
                    strict_json_loads(text)
                except DuplicateJSONKeyError as exc:
                    errors.append(f"duplicate JSON key: {rel_text}:{exc}")
                except json.JSONDecodeError as exc:
                    errors.append(f"invalid JSON: {rel_text}:{exc.lineno}:{exc.colno}: {exc.msg}")
            if suffix in {".yaml", ".yml"}:
                errors.extend(yaml_errors(rel_text, text))
            if suffix == ".md":
                errors.extend(markdown_link_errors(root, path, file_targets, dir_targets))

    if tracked_total > max_tracked_total_bytes:
        errors.append(f"tracked repository total exceeds {max_tracked_total_bytes} bytes: {tracked_total}")

    if binary_total > max_binary_total_bytes:
        errors.append(f"tracked binary/media total exceeds {max_binary_total_bytes} bytes: {binary_total}")

    return errors


def check_repository(root: Path, expected_head: str | None = None) -> list[str]:
    files = tracked_files(root)
    errors = check_expected_head(root, expected_head)
    errors.extend(check_files(root, files))
    return errors


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--expected-head", default=None)
    args = parser.parse_args(argv[1:])
    root = args.root.resolve()

    try:
        errors = check_repository(root, args.expected_head)
        tracked_count = len(tracked_files(root))
    except (OSError, RuntimeError) as exc:
        print(f"CI_HYGIENE_FAILED\n- {exc}", file=sys.stderr)
        return 1

    if errors:
        print("CI_HYGIENE_FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"CI_HYGIENE_PASSED tracked_files={tracked_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
