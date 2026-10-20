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
  if (dataDir !== undefined && dataDir !== "") return { dataDir };
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
