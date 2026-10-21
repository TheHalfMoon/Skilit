import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { prepareDataDir } from "../lib/mcp-db.ts";

const withTemp = (fn) => {
  const root = mkdtempSync(path.join(tmpdir(), "skilit-data-dir-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("a relative data directory fails closed", () => {
  assert.throws(
    () => prepareDataDir("relative/data/dir"),
    /must be an absolute path/,
  );
});

test("a data directory is created owner-only", () => {
  withTemp((root) => {
    const target = path.join(root, "fresh");
    prepareDataDir(target);
    const mode = statSync(target).mode & 0o777;
    assert.equal(mode, 0o700);
  });
});

test("an existing world-readable data directory is tightened to owner-only", () => {
  withTemp((root) => {
    const target = path.join(root, "existing");
    mkdirSync(target, { recursive: true });
    chmodSync(target, 0o755);
    assert.equal(statSync(target).mode & 0o777, 0o755);
    prepareDataDir(target);
    assert.equal(statSync(target).mode & 0o777, 0o700);
  });
});

test("a nested data directory is created owner-only", () => {
  withTemp((root) => {
    const target = path.join(root, "a", "b", "c");
    prepareDataDir(target);
    assert.equal(statSync(target).mode & 0o777, 0o700);
  });
});
