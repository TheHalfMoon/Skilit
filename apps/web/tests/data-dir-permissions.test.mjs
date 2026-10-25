import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
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

test("symlinked PGlite path fails closed without chmodding its target", {
  skip: process.platform === "win32",
}, () => {
  withTemp((root) => {
    const unrelated = path.join(root, "another-workspace");
    mkdirSync(unrelated, { mode: 0o700 });
    chmodSync(unrelated, 0o755);
    const pointer = path.join(root, "pglite-symlink");
    symlinkSync(unrelated, pointer, "dir");

    assert.throws(() => prepareDataDir(pointer),
      /symbolic link|ELOOP|ENOTDIR|directory/i);
    assert.equal(lstatSync(pointer).isSymbolicLink(), true);
    assert.equal(statSync(unrelated).mode & 0o777, 0o755,
      "rejecting the symlink must not modify an unrelated directory");
  });
});
