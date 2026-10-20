/** Reproducible v1 Local release-candidate builder (offline, no secrets).
 *
 * `node scripts/build_release_candidate.mjs --out <dir> [--version <label>]`
 * Produces in <out>: `skilit-<version>-<shortsha>.tar.gz` (via `git archive HEAD`),
 * `manifest.json`, and `SHA256SUMS`. Fails closed on: forbidden tracked paths
 * (secrets, credentials, private keys, env files), oversize archives, missing
 * tooling, or SBOM absence. Exit 0 ok, 2 invalid input, 3 tool unavailable.
 * The tarball is a *candidate*: it is unsigned until the owner signing
 * ceremony (OD-02), and the version label is a proposal until OD-03.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const FORBIDDEN_SEGMENTS = [
  ".env",
  ".pem",
  ".key",
  "credentials.json",
  "secrets.json",
  "id_rsa",
  "id_ed25519",
  "node_modules/",
  ".ignore",
];

function fail(code, message) {
  console.error(`RELEASE_CANDIDATE_FAIL ${message}`);
  process.exit(code);
}

// The source count is derived from the lock file so the manifest can never
// drift from the inventory it claims to describe.
function upstreamSourceCount() {
  const lockPath = join(REPO_ROOT, "UPSTREAMS.lock.yml");
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (error) {
    fail(2, `UPSTREAMS.lock.yml is unreadable: ${error?.message ?? error}`);
  }
  const count = Array.isArray(lock?.sources) ? lock.sources.length : 0;
  if (count === 0) fail(2, "UPSTREAMS.lock.yml lists no sources");
  return count;
}

function run(cmd, args, opts = {}) {
  const proc = spawnSync(cmd, args, { encoding: "buffer", ...opts });
  if (proc.status !== 0) {
    return null;
  }
  return proc.stdout;
}

function parseArgs(argv) {
  const out = { outDir: null, version: "v1.0.0-local-rc.1" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out" && i + 1 < argv.length) {
      out.outDir = argv[(i += 1)];
    } else if (argv[i] === "--version" && i + 1 < argv.length) {
      out.version = argv[(i += 1)];
    } else {
      fail(2, `unknown or incomplete argument: ${argv[i]}`);
    }
  }
  if (!out.outDir) {
    fail(2, "--out <dir> is required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(out.version)) {
    fail(2, `unsafe version label: ${out.version}`);
  }
  return out;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const { outDir, version } = parseArgs(process.argv.slice(2));

for (const tool of ["git", "gzip"]) {
  if (run("command", ["-v", tool]) === null && run("which", [tool]) === null) {
    fail(3, `tool unavailable: ${tool}`);
  }
}

const headRaw = run("git", ["-C", REPO_ROOT, "rev-parse", "HEAD"], {});
if (headRaw === null) {
  fail(3, "cannot resolve HEAD");
}
const head = headRaw.toString().trim();
const short = head.slice(0, 7);

const trackedRaw = run("git", ["-C", REPO_ROOT, "ls-files"], {});
if (trackedRaw === null) {
  fail(3, "cannot list tracked files");
}
const tracked = trackedRaw.toString().trim().split("\n").filter(Boolean);
const violations = tracked.filter((p) =>
  FORBIDDEN_SEGMENTS.some((seg) => p === seg || p.endsWith(seg) || p.includes(seg)),
);
if (violations.length > 0) {
  fail(2, `forbidden tracked paths in candidate: ${violations.slice(0, 10).join(", ")}`);
}

const sbomPath = join(REPO_ROOT, "sbom.json");
if (!existsSync(sbomPath)) {
  fail(2, "sbom.json absent; candidate requires a fresh SBOM");
}

mkdirSync(outDir, { recursive: true });
const tarballName = `skilit-${version}-${short}.tar.gz`;
const tarballPath = join(outDir, tarballName);

const archive = spawnSync("git", ["-C", REPO_ROOT, "archive", "--format=tar", "HEAD"], {
  encoding: "buffer",
  maxBuffer: MAX_ARCHIVE_BYTES,
});
if (archive.status !== 0) {
  fail(3, "git archive failed");
}
const gz = spawnSync("gzip", ["-n", "-9"], {
  input: archive.stdout,
  encoding: "buffer",
  maxBuffer: MAX_ARCHIVE_BYTES,
});
if (gz.status !== 0 || !gz.stdout) {
  fail(3, "gzip failed");
}
if (gz.stdout.length > MAX_ARCHIVE_BYTES) {
  fail(2, `archive exceeds budget: ${gz.stdout.length} bytes`);
}
writeFileSync(tarballPath, gz.stdout);

const manifest = {
  name: "skilit-v1-local-release-candidate",
  version,
  commit: head,
  built_from: "git archive HEAD (tracked files only)",
  signed: false,
  signing: "pending owner ceremony OD-02; self-test signatures never qualify",
  license: "Apache-2.0 for Skilit-owned code (root LICENSE, OD-05); two monet-registry files carved out per root NOTICE section 2; see NOTICE",
  files: tracked.length,
  artifacts: {
    tarball: tarballName,
    tarball_sha256: sha256File(tarballPath),
    tarball_bytes: statSync(tarballPath).size,
  },
  sbom: { file: "sbom.json", sha256: sha256File(sbomPath) },
  provenance: `UPSTREAMS.lock.yml (${upstreamSourceCount()} sources) + CODE_PROVENANCE.md + DATA_PROVENANCE.md`,
  verification: "docs/operations/RELEASE_CANDIDATE.md",
};
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(
  join(outDir, "SHA256SUMS"),
  `${manifest.artifacts.tarball_sha256}  ${tarballName}\n${manifest.sbom.sha256}  sbom.json\n`,
);

process.stdout.write(`${JSON.stringify({ ok: true, tarball: tarballName, ...manifest.artifacts, files: tracked.length })}\n`);
