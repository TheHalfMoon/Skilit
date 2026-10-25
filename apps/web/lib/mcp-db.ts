import { chmodSync, closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

import { openDatabase, type DbClient } from "../../../packages/db/src/db.ts";

/**
 * Shared database handle for web routes. Reused across requests so the
 * PostgreSQL pool is not churned per call; the local dev fallback
 * (PGlite) likewise boots once. Test and dispatcher code keeps passing
 * explicit handles instead of this singleton.
 *
 * No migrations run here: schema deployment belongs to the operations
 * runbook. An unmigrated database fails closed at the tool layer with
 * an opaque error instead of leaking internals.
 */

let shared: Promise<DbClient> | null = null;

/**
 * A PGlite data directory holds password verifiers and session-token
 * hashes, so it must be an absolute path the operator chose, and it must
 * not be readable by other users on a shared host. The directory is
 * created with owner-only permissions before PGlite opens it.
 */
export function prepareDataDir(dataDir: string): string {
  if (!path.isAbsolute(dataDir)) {
    throw new Error("SKILIT_MCP_PGLITE_DATA_DIR must be an absolute path");
  }
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // Never chmod a symbolic link's target: the operator may have configured
  // a stale path, or a local peer may have substituted its directory entry.
  // Windows has different directory-handle semantics, but can still reject
  // the final symlink before preserving its prior chmod behavior.
  if (process.platform === "win32") {
    const entry = lstatSync(dataDir);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("PGlite data directory must be a real directory, not a symbolic link");
    }
    chmodSync(dataDir, 0o700);
    return dataDir;
  }

  // Bind the permission change to an actual directory handle. O_NOFOLLOW
  // rejects final-component symlinks and fchmod avoids name-based retargeting
  // between a path check and the permission operation.
  const fd = openSync(
    dataDir,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const info = fstatSync(fd);
    if (!info.isDirectory()) {
      throw new Error("PGlite data directory must be a real directory");
    }
    fchmodSync(fd, 0o700);
    const secured = fstatSync(fd);
    const entry = lstatSync(dataDir);
    if (!entry.isDirectory() || entry.isSymbolicLink() ||
        entry.dev !== secured.dev || entry.ino !== secured.ino ||
        (secured.mode & 0o077) !== 0) {
      throw new Error("PGlite data directory changed or is not owner-only");
    }
    return dataDir;
  } finally {
    closeSync(fd);
  }
}

/**
 * Database selection, in order:
 *  1. an explicit PostgreSQL connection string, when configured;
 *  2. a local PGlite data directory, when configured — a persistent,
 *     service-free local database for developers and for isolated tests;
 *  3. otherwise the in-memory PGlite fallback.
 */
function databaseOptions():
  | { connectionString: string }
  | { dataDir: string }
  | undefined {
  const url =
    process.env.SKILIT_MCP_DATABASE_URL ??
    process.env.SKELET_MCP_DATABASE_URL;
  if (url !== undefined) return { connectionString: url };
  const dataDir = process.env.SKILIT_MCP_PGLITE_DATA_DIR;
  if (dataDir !== undefined && dataDir !== "") return { dataDir: prepareDataDir(dataDir) };
  return undefined;
}

export function getSharedDb(): Promise<DbClient> {
  if (shared === null) {
    shared = openDatabase(databaseOptions()).catch((error: unknown) => {
      shared = null;
      throw error;
    });
  }
  return shared;
}
