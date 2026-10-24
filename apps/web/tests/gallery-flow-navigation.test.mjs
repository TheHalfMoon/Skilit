import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  flowExplorerHref,
  versionFilterFromSearch,
} from "../lib/gallery-flow-navigation.ts";

const VERSION_ID = "12345678-1234-4234-9234-1234567890ab";

test("qualified version URIs lead to the existing authorized flow list", () => {
  const href = flowExplorerHref(`skilit://version/${VERSION_ID}`);
  assert.equal(href, `/flows?productVersionId=${VERSION_ID}`);
  assert.equal(versionFilterFromSearch(href.slice("/flows".length)), VERSION_ID);
});

test("invalid IDs and dangerous strings do not create browse links", () => {
  for (const uri of [
    "skilit://version/../../login",
    "skilit://product/12345678-1234-4234-9234-1234567890ab",
    "skilit://version/javascript:alert(1)",
    "skilit://version/12345?auth=secret",
    "skilit://version/12345678-1234-4234-9234-1234567890ab%2Fother",
    "https://example.invalid/foo",
  ]) {
    assert.equal(flowExplorerHref(uri), null);
  }
  for (const search of ["", "?productVersionId=../foo", "?productVersionId=<script>"]) {
    assert.equal(versionFilterFromSearch(search), null);
  }
});

test("cross-page UI wires the existing REST endpoint without client authority", async () => {
  const gallery = await readFile(new URL("../app/gallery/page.tsx", import.meta.url), "utf8");
  const flows = await readFile(new URL("../app/flows/page.tsx", import.meta.url), "utf8");
  assert.ok(gallery.includes('import Link from "next/link"'));
  assert.ok(gallery.includes("flowExplorerHref(version.uri)"));
  assert.ok(gallery.includes("Explore flows"));
  assert.ok(flows.includes("versionFilterFromSearch(window.location.search)"));
  assert.ok(flows.includes('params.set("productVersionId", versionFilter.trim())'));
  assert.ok(flows.includes('sessionRequest(path, init)'));
  assert.ok(!gallery.includes("Authorization:"));
  assert.ok(!flows.includes("Authorization:"));
});
