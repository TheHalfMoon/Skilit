"""Root LICENSE + consolidated NOTICE conformance tests (OD-05).

Machine-checks the OD-05 release-packaging remainder offline: the root
Apache-2.0 LICENSE for original Skilit-owned code, the consolidated
NOTICE preserving upstream copyrights/licenses/attribution/restrictions
with its compatibility finding, the monet carve-out (no relicensing),
the builder manifest license state, and the updated RC procedure doc.
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LICENSE_PATH = ROOT / "LICENSE"
NOTICE_PATH = ROOT / "NOTICE"
BUILDER_PATH = ROOT / "scripts" / "build_release_candidate.mjs"
DOC_PATH = ROOT / "docs" / "operations" / "RELEASE_CANDIDATE.md"


class LicenseNoticeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.license_text = LICENSE_PATH.read_text(encoding="utf-8")
        cls.notice = NOTICE_PATH.read_text(encoding="utf-8")
        cls.builder = BUILDER_PATH.read_text(encoding="utf-8")
        cls.doc = DOC_PATH.read_text(encoding="utf-8")

    def test_license_is_apache_2(self) -> None:
        for token in ("Apache License", "Version 2.0, January 2004",
                      "http://www.apache.org/licenses/",
                      "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION",
                      "Grant of Copyright License",
                      "Grant of Patent License",
                      "Disclaimer of Warranty",
                      "Limitation of Liability",
                      "Copyright 2026 TheHalfMoon and Skilit contributors"):
            self.assertIn(token, self.license_text, msg=f"LICENSE missing: {token}")

    def test_notice_scope_and_no_relicense(self) -> None:
        for token in ("v1.0.0-local-rc.1", "OD-05",
                      "does not relicense any third-party material",
                      "NOT under the Skilit Apache-2.0 grant",
                      "no genuine licensing conflict blocks"):
            self.assertIn(token, self.notice, msg=f"NOTICE missing: {token}")

    def test_notice_monet_carveout(self) -> None:
        for token in ("apps/web/lib/utils.ts",
                      "packages/providers/monet/screenshot/queue.ts",
                      "85c966f8d94572431bcbb4439f9fd7ea2a893321",
                      # Historical authorization ID retains original bytes (see NOTICE successor note).
                      "skelet-founder-2026-10-04-listed-sources",
                      "NOT VERIFIED"):
            self.assertIn(token, self.notice, msg=f"NOTICE missing: {token}")

    def test_notice_donor_pins_and_restrictions(self) -> None:
        for token in ("28a39a0de4a2fc2eccc237df2046c24245bd12ab",
                      "02a3de2509662cfc7c12f51c09e7f4322618029a",
                      "6c3f9f60aa69ac151f9908b94cf00a387746eea4",
                      "97136485f0743251ab330d096ca6c9d0f0f6f54c",
                      "78355fd3890cc9da9539235ee3b38beb917f2ed6",
                      "Fair Source WIP",
                      "NOT an open-source grant",
                      "NO source file to this candidate",
                      "no donor code vendored"):
            self.assertIn(token, self.notice, msg=f"NOTICE missing: {token}")

    def test_notice_exclusions(self) -> None:
        for token in ("explicitly EXCLUDED", "NOT distributed",
                      "Nintendo", "Mixamo", "SIL OFL 1.1",
                      "Meta SAM License", "never bundle",
                      "No secret, credential"):
            self.assertIn(token, self.notice, msg=f"NOTICE missing: {token}")

    def test_notice_runtime_deps(self) -> None:
        for token in ("next 15.5.27 — MIT", "react 19.3.0 — MIT",
                      "pg 8.23.1 — MIT",
                      "@electric-sql/pglite 0.5.8 — Apache-2.0",
                      "playwright-core 1.56.1 — Apache-2.0",
                      "axe-core 4.14.0",
                      "frozen lockfile"):
            self.assertIn(token, self.notice, msg=f"NOTICE missing: {token}")

    def test_notice_trademarks(self) -> None:
        for token in ("respective owners",
                      "nominative compatibility references only",
                      "grant no trademark rights"):
            self.assertIn(token, self.notice, msg=f"NOTICE missing: {token}")

    def test_builder_manifest_reflects_od05(self) -> None:
        self.assertIn("root LICENSE, OD-05", self.builder)
        self.assertIn("carved out per root NOTICE", self.builder)
        self.assertNotIn("pending owner decision OD-05", self.builder,
                         msg="builder still claims the OD-05 gap")

    def test_rc_doc_records_resolution(self) -> None:
        for token in ("OD-05 (license, RESOLVED)", "root `LICENSE`",
                      "root `NOTICE`", "no blocking conflict"):
            self.assertIn(token, self.doc, msg=f"RC doc missing: {token}")
        self.assertNotIn("no root `LICENSE` file and no consolidated `NOTICE` file exist",
                         self.doc, msg="RC doc still claims the gap")

    def test_notice_source_tally_matches_the_lock(self) -> None:
        """The NOTICE pointer must not drift from the inventory it describes."""
        lock = json.loads((ROOT / "UPSTREAMS.lock.yml").read_text(encoding="utf-8"))
        sources = lock["sources"]
        counts: dict[str, int] = {}
        for source in sources:
            status = source["status"]
            counts[status] = counts.get(status, 0) + 1
        tally = ", ".join(
            f"{counts[status]} {status}"
            for status in ("ready", "planned", "imported")
            if status in counts
        )
        normalized = " ".join(self.notice.split())
        self.assertIn(
            f"UPSTREAMS.lock.yml ({len(sources)} sources: {tally})",
            normalized,
            msg="NOTICE source tally must match UPSTREAMS.lock.yml",
        )
        self.assertNotRegex(
            self.builder,
            r"UPSTREAMS\.lock\.yml \(\d+ sources\)",
            msg="the release builder must derive the source count, not hardcode it",
        )
        # The live acceptance contract is a current canonical reference, so
        # its tally must track the lock too. Dated AF-12 qualification runs
        # are historical evidence and are deliberately left alone.
        contract = " ".join(
            (ROOT / "docs" / "qualification" / "V1_LOCAL_ACCEPTANCE_CONTRACT.md")
            .read_text(encoding="utf-8")
            .split()
        )
        self.assertIn(
            f"({len(sources)} sources)",
            contract,
            msg="the acceptance contract must carry the current source tally",
        )
        stale = set(re.findall(r"\((\d+) sources\)", contract)) - {str(len(sources))}
        self.assertEqual(
            stale,
            set(),
            msg="the acceptance contract must not carry a stale source tally",
        )

    def test_no_signed_final_claim(self) -> None:
        self.assertNotRegex(self.notice, r"(?i)officially signed")
        self.assertIn("explicitly UNSIGNED", self.notice)


if __name__ == "__main__":
    unittest.main()
