"""Font import audit for the pinned Inter Tight brand subset.

The bundled wordmark font is a SIL OFL 1.1 Modified Version, and the
OFL conditions are what make its redistribution lawful. Three claims
carry that licence and are asserted nowhere else, so this module holds
them:

- the import manifest and the canonical upstream lock agree on the pin,
  the licence, and the exact set of imported paths;
- the bundled licence text carries the upstream copyright notice and does
  **not** carry a Reserved Font Name, which is the fact that allows the
  rename to the distinct CSS family name;
- the derived subset and the licence copies in the tree are the bytes the
  provenance records claim they are.

The subsetting tool used for the upstream-TTF-to-WOFF2 step is not
recorded, so that step is asserted by digest rather than regenerated.
The limitation is asserted to be disclosed so it cannot be quietly
dropped from the manifest.
"""

from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "imports" / "inter-tight-google-fonts" / "manifest.json"
LOCK_PATH = ROOT / "UPSTREAMS.lock.yml"
WORDMARK_PATH = ROOT / "docs" / "brand" / "wordmark-inter-tight-600.json"
NOTICE_PATH = ROOT / "NOTICE"
BUNDLED_LICENCE = ROOT / "apps" / "web" / "public" / "brand" / "Inter-Tight-OFL.txt"
DOCS_LICENCE = ROOT / "docs" / "brand" / "licenses" / "Inter-Tight-OFL.txt"
BUNDLED_SUBSET = ROOT / "apps" / "web" / "public" / "brand" / "inter-tight-latin-600.woff2"
SOURCE_ID = "inter-tight-google-fonts"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class InterTightImportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.lock = json.loads(LOCK_PATH.read_text(encoding="utf-8"))
        self.wordmark = json.loads(WORDMARK_PATH.read_text(encoding="utf-8"))
        self.source = next(s for s in self.lock["sources"] if s["id"] == SOURCE_ID)

    def test_manifest_and_lock_agree(self) -> None:
        self.assertEqual(self.manifest["immutable_pin"], self.source["exact_commit_or_release"])
        self.assertEqual(self.manifest["license"], self.source["license"])
        self.assertEqual(self.manifest["imported_paths"], self.source["imported_paths"])
        self.assertEqual(self.manifest["state"], self.source["status"])
        self.assertEqual(self.manifest["upstream_source_id"], self.source["id"])

    def test_imported_paths_exist_in_the_tree(self) -> None:
        for relative in self.source["imported_paths"]:
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).is_file(), relative)

    def test_licence_text_carries_no_reserved_font_name(self) -> None:
        licence = BUNDLED_LICENCE.read_text(encoding="utf-8")
        self.assertIn("Copyright 2022 The Inter Project Authors", licence)
        self.assertNotRegex(licence, re.compile(r"with\s+Reserved\s+Font\s+Name", re.IGNORECASE))
        # The two licence copies in the tree are the same bytes.
        self.assertEqual(_sha256(BUNDLED_LICENCE), _sha256(DOCS_LICENCE))

    def test_bundled_subset_matches_the_recorded_digest(self) -> None:
        self.assertEqual(_sha256(BUNDLED_SUBSET), self.wordmark["subsetSha256"])

    def test_licence_copy_matches_the_recorded_digest(self) -> None:
        self.assertEqual(_sha256(BUNDLED_LICENCE), self.wordmark["sourceLicenseSha256"])

    def test_upstream_digests_are_well_formed(self) -> None:
        font = self.manifest["upstream_files"]["font"]
        licence = self.manifest["upstream_files"]["license"]
        for record in (font, licence):
            with self.subTest(path=record["path"]):
                self.assertRegex(record["sha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(self.manifest["immutable_pin"], r"^[0-9a-f]{40}$")

    def test_the_unrecorded_subsetting_tool_is_disclosed(self) -> None:
        # The upstream-TTF-to-WOFF2 derivation is asserted by digest because
        # the subsetting tool is not recorded. That limitation must stay
        # visible in the manifest, the wordmark record and the NOTICE.
        limitation = " ".join(self.manifest["known_limitations"]).lower()
        self.assertIn("subsetting tool", limitation)
        self.assertIn("not recorded", limitation)
        self.assertIn("subsetting tool", " ".join(self.wordmark.get("knownLimitations", [])).lower())
        notice = NOTICE_PATH.read_text(encoding="utf-8")
        self.assertIn("subsetting tool", notice.lower())


if __name__ == "__main__":
    unittest.main()
