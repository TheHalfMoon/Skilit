/**
 * AF-14 P14 local OpenPencil adapter (Skilit-owned, no donor vendoring).
 *
 * Optional headless adapter for the pinned OpenPencil CLI contract at
 * `78355fd3890cc9da9539235ee3b38beb917f2ed6` (verified 2026-10-15, MIT,
 * version 0.16.0). The adapter never vendors donor code, never downloads or
 * installs a binary, never performs network access, and never requires a
 * paid provider. It is disabled unless explicitly configured with an
 * absolute executable path and a confined filesystem root.
 *
 * Verified upstream contract (packages/cli at the pinned commit):
 * - binary name is `openpencil` (never bare PATH lookup);
 * - file mode is headless: every allowlisted command takes a document file
 *   positional (`tree|node|query|info|export|convert <file> ...`) and runs
 *   through `loadDocument` + `executeRPCCommand` without a running desktop
 *   app (see src/headless.ts, src/rpc-data.ts);
 * - app mode (omitted file, WebSocket to the Tauri desktop over
 *   127.0.0.1/unix socket with bearer token, 30 s RPC timeout) is NOT
 *   used here: a missing input file fails closed as invalid input;
 * - app-target options (`--document-id`, `--page-id`) are never emitted;
 * - readable document formats are `.fig` (native) and `.pen` (JSON
 *   interchange, read-only); `.fig` is the only writable document format
 *   (`writeDocument` exists only for fig; pen has `readDocument` only);
 * - headless `export` supports fig/svg/png/jpg/webp (plus pdf/pptx/html/jsx
 *   code paths that this adapter deliberately refuses for the smallest
 *   grain: font-policy/asset/code-generation complexity);
 * - `convert` writes a document format (fig only in practice);
 * - `documents|import|diff|eval|tool|tokens|fonts|formats|find|history|pages|
 *   variables|libraries|lint|analyze|selection|settings` exist on the real
 *   CLI but are deliberately NOT allowlisted here (app-bridged, mutating,
 *   or code-generation surface for a later grain, if ever).
 *
 * Skilit confinement mirrors the VectorCraft/PhotoCraft adapters (AF-10/11):
 * every input must resolve inside the operator-owned root, every output must
 * resolve inside the root, links are followed via realpath, and escapes are
 * refused with a deterministic `document/path-escape` error.
 * Check-then-use has an inherent TOCTOU race against other local software
 * swapping links between validation and spawn; the roots confine this
 * adapter's own invocation rather than defending against a hostile local
 * peer.
 *
 * Subprocess safety: execFile with no shell, allowlisted argv only, scrubbed
 * environment (no ambient credentials), cwd confined to the root, bounded
 * timeout with SIGKILL, bounded stdout/output bytes, truncated diagnostics.
 * Untrusted project content is never executed: only the configured binary
 * runs, with fixed subcommands and validated file operands.
 *
 * Fixture boundary: process-level tests use faithful fixture executables
 * that speak the same argv shapes (`tree FILE --json`, `info FILE --json`,
 * `query FILE SELECTOR --json`, `node FILE --id ID --json`,
 * `export FILE --format FMT --output OUT`, `convert FILE --output OUT
 * --format fig`). Fixture success MUST NOT be represented as genuine
 * upstream OpenPencil binary verification. Upstream compatibility stays
 * UNVERIFIED until the genuine `openpencil` binary at the pinned commit is
 * built and the same suite runs against it (see docs/provenance
 * OPENPENCIL_EVALUATION_2026-10-15.md).
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, realpath, readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep, extname } from "node:path";
import { hasSvgEventHandlerAttribute, inspectSvgDimensionsLinear } from "./svg-guard.ts";

export const OPENPENCIL_ADAPTER_ID = "skilit-document" as const;
export const OPENPENCIL_CAPABILITY = "editable-document" as const;
/** Exact upstream pin from UPSTREAMS.lock.yml (openpencil, ready). */
export const OPENPENCIL_PIN =
  "78355fd3890cc9da9539235ee3b38beb917f2ed6" as const;

/** Legacy adapter ID from before the Skilit rebrand; accepted on read. */
export const LEGACY_OPENPENCIL_ADAPTER_ID = "openpencil-local" as const;

export const OPENPENCIL_OPERATIONS = [
  "tree",
  "node",
  "query",
  "info",
  "export",
  "convert",
] as const;
export type OpenpencilOperation = (typeof OPENPENCIL_OPERATIONS)[number];

/** Operations the real CLI supports but Skilit deliberately refuses. */
const REFUSED_OPERATIONS: readonly string[] = [
  "documents",
  "import",
  "diff",
  "eval",
  "tool",
  "tokens",
  "fonts",
  "formats",
  "find",
  "history",
  "pages",
  "variables",
  "libraries",
  "lint",
  "analyze",
  "selection",
  "settings",
  "run",
  "mcp",
  "serve",
  "bench",
];

/** Editable document inputs accepted inside the confined root. */
const INPUT_EXTENSIONS: readonly string[] = [".fig", ".pen"];

/** Export formats honoured by this grain (file-mode, no codegen). */
export const OPENPENCIL_EXPORT_FORMATS = [
  "fig",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;
export type OpenpencilExportFormat =
  (typeof OPENPENCIL_EXPORT_FORMATS)[number];

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MIN_MAX_OUTPUT_BYTES = 1_024;
const MAX_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_PATH_CHARS = 1_024;
const MAX_ID_CHARS = 128;
const MAX_PAGE_CHARS = 128;
const MAX_SELECTOR_CHARS = 512;
const MAX_DEPTH = 10;
const MAX_LIMIT = 1_000;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const MIN_QUALITY = 0;
const MAX_QUALITY = 100;
const ERROR_MESSAGE_MAX_CHARS = 2_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,127}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const SKILIT_URI_PATTERN =
  /^skilit:\/\/(artifact|collection)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOWS_DEVICE_NAMES: readonly string[] = [
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
];

export type OpenpencilErrorCode =
  | "document/disabled"
  | "document/unavailable"
  | "document/invalid-config"
  | "document/invalid-input"
  | "document/path-escape"
  | "document/unsupported-operation"
  | "document/unsupported-format"
  | "document/malformed-output"
  | "document/timeout"
  | "document/canceled"
  | "document/failed"
  | "document/output-limit";

export class OpenpencilAdapterError extends Error {
  readonly code: OpenpencilErrorCode;
  constructor(code: OpenpencilErrorCode, message: string) {
    super(message);
    this.name = "OpenpencilAdapterError";
    this.code = code;
  }
}

function fail(code: OpenpencilErrorCode, message: string): never {
  throw new OpenpencilAdapterError(code, message);
}

function truncate(message: string): string {
  return message.length > ERROR_MESSAGE_MAX_CHARS
    ? message.slice(0, ERROR_MESSAGE_MAX_CHARS)
    : message;
}

export interface OpenpencilRequestor {
  /** Authenticated actor identity; anonymous invocations are refused. */
  actorId: string;
  /** Workspace scope that owns the confined root. */
  workspaceId: string;
}

export interface OpenpencilAdapterConfig {
  /** Master switch. Anything other than literal true is disabled. */
  enabled: boolean;
  /**
   * Absolute path to the operator-installed `openpencil` binary.
   * Bare names and PATH lookups are refused to prevent binary hijack.
   */
  executablePath?: string;
  /** Operator-owned confined root for all file operands. */
  rootDir: string;
  /** Per-invocation ceiling in milliseconds. */
  timeoutMs?: number;
  /** Ceiling for produced document/export bytes. */
  maxOutputBytes?: number;
  /** Must equal OPENPENCIL_PIN when enabled. */
  versionPin?: string;
}

export interface ResolvedOpenpencilConfig {
  enabled: true;
  executablePath: string;
  rootDir: string;
  rootReal: string;
  timeoutMs: number;
  maxOutputBytes: number;
  versionPin: string;
}

export interface OpenpencilTreeInput {
  operation: "tree";
  requestor: OpenpencilRequestor;
  inputFile: string;
  page?: string;
  depth?: number;
}

export interface OpenpencilNodeInput {
  operation: "node";
  requestor: OpenpencilRequestor;
  inputFile: string;
  nodeId: string;
}

export interface OpenpencilQueryInput {
  operation: "query";
  requestor: OpenpencilRequestor;
  inputFile: string;
  selector: string;
  page?: string;
  limit?: number;
}

export interface OpenpencilInfoInput {
  operation: "info";
  requestor: OpenpencilRequestor;
  inputFile: string;
}

export interface OpenpencilExportInput {
  operation: "export";
  requestor: OpenpencilRequestor;
  inputFile: string;
  outputFile: string;
  format: OpenpencilExportFormat;
  page?: string;
  nodeId?: string;
  scale?: number;
  quality?: number;
}

export interface OpenpencilConvertInput {
  operation: "convert";
  requestor: OpenpencilRequestor;
  inputFile: string;
  outputFile: string;
}

export type OpenpencilInput =
  | OpenpencilTreeInput
  | OpenpencilNodeInput
  | OpenpencilQueryInput
  | OpenpencilInfoInput
  | OpenpencilExportInput
  | OpenpencilConvertInput;

export interface OpenpencilProvenance {
  adapterId: typeof OPENPENCIL_ADAPTER_ID;
  capability: typeof OPENPENCIL_CAPABILITY;
  version: typeof OPENPENCIL_PIN;
  egress: "local";
  costClass: "free-local";
  operation: OpenpencilOperation;
}

export interface OpenpencilSuccess {
  operation: OpenpencilOperation;
  /** Absolute confined output path for export/convert; undefined otherwise. */
  outputFile?: string;
  outputBytes?: number;
  outputSha256?: string;
  /** Parsed JSON for tree/node/query/info; undefined for export/convert. */
  stdoutJson?: unknown;
  provenance: OpenpencilProvenance;
  durationMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_ID_CHARS
  ) {
    fail("document/invalid-input", `OpenPencil ${label} is invalid.`);
  }
  if (!ID_PATTERN.test(value as string)) {
    fail("document/invalid-input", `OpenPencil ${label} is invalid.`);
  }
  return value as string;
}

function validateRequestor(value: unknown): OpenpencilRequestor {
  if (!isRecord(value)) {
    fail("document/invalid-input", "OpenPencil requestor is invalid.");
  }
  const actorId = validateId(value.actorId, "actor identity");
  const workspaceId = validateId(value.workspaceId, "workspace identity");
  return { actorId, workspaceId };
}

function validateTimeout(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (
    !Number.isInteger(value) ||
    (value as number) < MIN_TIMEOUT_MS ||
    (value as number) > MAX_TIMEOUT_MS
  ) {
    fail("document/invalid-config", "OpenPencil timeout is invalid.");
  }
  return value as number;
}

function validateMaxOutput(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (
    !Number.isInteger(value) ||
    (value as number) < MIN_MAX_OUTPUT_BYTES ||
    (value as number) > MAX_MAX_OUTPUT_BYTES
  ) {
    fail("document/invalid-config", "OpenPencil output limit is invalid.");
  }
  return value as number;
}

function validateExecutablePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PATH_CHARS
  ) {
    fail("document/invalid-config", "OpenPencil executable path is invalid.");
  }
  const text = value as string;
  if (text.includes("\0")) {
    fail("document/invalid-config", "OpenPencil executable path is invalid.");
  }
  if (!isAbsolute(text)) {
    fail(
      "document/invalid-config",
      "OpenPencil executable path must be absolute; PATH lookup is refused.",
    );
  }
  return text;
}

function validateRootDir(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PATH_CHARS
  ) {
    fail("document/invalid-config", "OpenPencil root directory is invalid.");
  }
  const text = value as string;
  if (text.includes("\0")) {
    fail("document/invalid-config", "OpenPencil root directory is invalid.");
  }
  if (!isAbsolute(text)) {
    fail(
      "document/invalid-config",
      "OpenPencil root directory must be absolute.",
    );
  }
  return text;
}

/**
 * Validate operator configuration without touching the filesystem.
 * Disabled configurations do not throw here: callers surface disabled at
 * invocation time so that disabled-by-default is observable, not silent.
 */
export function validateOpenpencilAdapterConfig(
  raw: unknown,
): ResolvedOpenpencilConfig | { enabled: false } {
  if (!isRecord(raw)) {
    fail(
      "document/invalid-config",
      "OpenPencil adapter configuration is invalid.",
    );
  }
  if (raw.enabled !== true) {
    return { enabled: false as const };
  }
  const executablePath = validateExecutablePath(raw.executablePath);
  const rootDir = validateRootDir(raw.rootDir);
  const timeoutMs = validateTimeout(raw.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxOutputBytes = validateMaxOutput(
    raw.maxOutputBytes,
    DEFAULT_MAX_OUTPUT_BYTES,
  );
  const versionPin = raw.versionPin;
  if (versionPin !== OPENPENCIL_PIN) {
    fail(
      "document/invalid-config",
      "OpenPencil adapter version pin must match the qualified OpenPencil commit.",
    );
  }
  return {
    enabled: true as const,
    executablePath,
    rootDir,
    rootReal: rootDir,
    timeoutMs,
    maxOutputBytes,
    versionPin: OPENPENCIL_PIN,
  };
}

async function resolveRootReal(rootDir: string): Promise<string> {
  let info;
  try {
    info = await lstat(rootDir);
  } catch {
    fail("document/invalid-config", "OpenPencil root directory is unavailable.");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail(
      "document/invalid-config",
      "OpenPencil root directory must be a real directory.",
    );
  }
  try {
    return await realpath(rootDir);
  } catch {
    fail("document/invalid-config", "OpenPencil root directory is unavailable.");
  }
}

function rejectDeviceName(abs: string): void {
  const base = abs.split("/").pop() ?? "";
  const stem = base.split(".")[0] ?? "";
  if (WINDOWS_DEVICE_NAMES.includes(stem.toUpperCase())) {
    fail("document/invalid-input", "OpenPencil file path is invalid.");
  }
}

function insideRoot(abs: string, rootReal: string): boolean {
  return abs === rootReal || abs.startsWith(rootReal + sep);
}

/**
 * Resolve a caller-supplied file operand inside the confined root.
 * Relative paths resolve against the root; absolute paths must already
 * lie inside it. Existing files are realpath-checked so symlink escapes
 * are refused. New output paths are checked via their nearest existing
 * ancestor so `root/link/../outside` tricks fail closed with path-escape.
 */
export async function resolveConfinedOpenpencilPath(
  rootReal: string,
  userPath: string,
  mustExist: boolean,
): Promise<string> {
  if (
    typeof userPath !== "string" ||
    userPath.length === 0 ||
    userPath.length > MAX_PATH_CHARS
  ) {
    fail("document/invalid-input", "OpenPencil file path is invalid.");
  }
  if (userPath.includes("\0")) {
    fail("document/invalid-input", "OpenPencil file path is invalid.");
  }
  const abs = isAbsolute(userPath)
    ? resolve(userPath)
    : resolve(rootReal, userPath);
  rejectDeviceName(abs);
  if (!insideRoot(abs, rootReal)) {
    fail(
      "document/path-escape",
      "OpenPencil file path escapes the confined root.",
    );
  }
  if (abs === rootReal) {
    fail(
      "document/invalid-input",
      "OpenPencil file path must name a file inside the root.",
    );
  }
  if (mustExist) {
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      fail("document/invalid-input", "OpenPencil input file is unavailable.");
    }
    if (!insideRoot(real as string, rootReal)) {
      fail(
        "document/path-escape",
        "OpenPencil file path escapes the confined root.",
      );
    }
    let info;
    try {
      info = await lstat(real as string);
    } catch {
      fail("document/invalid-input", "OpenPencil input file is unavailable.");
    }
    if (!info.isFile() || info.isSymbolicLink()) {
      fail(
        "document/path-escape",
        "OpenPencil file path escapes the confined root.",
      );
    }
    return real as string;
  }
  let cursor = abs;
  const missing: string[] = [];
  for (let depth = 0; depth < 32; depth += 1) {
    try {
      const info = await lstat(cursor);
      void info;
      break;
    } catch {
      const slash = cursor.lastIndexOf(sep);
      if (slash < 0) {
        fail(
          "document/path-escape",
          "OpenPencil file path escapes the confined root.",
        );
      }
      const leaf = cursor.slice(slash + 1);
      if (leaf === "" || leaf === "." || leaf === "..") {
        fail(
          "document/path-escape",
          "OpenPencil file path escapes the confined root.",
        );
      }
      if (leaf.length > 255 || leaf.includes("\0")) {
        fail("document/invalid-input", "OpenPencil file path is invalid.");
      }
      missing.unshift(leaf);
      cursor = cursor.slice(0, slash) || sep;
      continue;
    }
  }
  let ancestorReal: string;
  try {
    ancestorReal = await realpath(cursor);
  } catch {
    fail("document/invalid-input", "OpenPencil output path is unavailable.");
  }
  if (!insideRoot(ancestorReal as string, rootReal)) {
    fail(
      "document/path-escape",
      "OpenPencil file path escapes the confined root.",
    );
  }
  for (const leaf of missing) {
    if (leaf === ".." || leaf.includes(sep)) {
      fail(
        "document/path-escape",
        "OpenPencil file path escapes the confined root.",
      );
    }
  }
  return abs;
}

function validateInputExtension(filePath: string): void {
  const extension = extname(filePath).toLowerCase();
  if (!INPUT_EXTENSIONS.includes(extension)) {
    fail(
      "document/unsupported-format",
      "OpenPencil input format is not supported; only .fig and .pen documents are editable.",
    );
  }
}

function validateOutputExtensionForExport(
  filePath: string,
  format: OpenpencilExportFormat,
): void {
  const extension = extname(filePath).toLowerCase().replace(/^\./, "");
  const normalized = extension === "jpeg" ? "jpeg" : extension;
  const expected = format.toLowerCase();
  const pair =
    (expected === "jpg" && normalized === "jpg") ||
    (expected === "jpeg" && (normalized === "jpeg" || normalized === "jpg")) ||
    (expected !== "jpg" && expected !== "jpeg" && normalized === expected);
  if (!pair) {
    fail(
      "document/invalid-input",
      "OpenPencil export output extension must match its format.",
    );
  }
}

function validatePage(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PAGE_CHARS
  ) {
    fail("document/invalid-input", "OpenPencil page is invalid.");
  }
  const text = value as string;
  if (text.includes("\0") || text.startsWith("-")) {
    fail("document/invalid-input", "OpenPencil page is invalid.");
  }
  if (!PAGE_PATTERN.test(text)) {
    fail("document/invalid-input", "OpenPencil page is invalid.");
  }
  return text;
}

function validateNodeId(value: unknown): string {
  return validateId(value, "node identity");
}

function validateSelector(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SELECTOR_CHARS
  ) {
    fail("document/invalid-input", "OpenPencil selector is invalid.");
  }
  if ((value as string).includes("\0")) {
    fail("document/invalid-input", "OpenPencil selector is invalid.");
  }
  return value as string;
}

function validateDepth(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_DEPTH
  ) {
    fail("document/invalid-input", "OpenPencil depth is invalid.");
  }
  return value as number;
}

function validateLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_LIMIT
  ) {
    fail("document/invalid-input", "OpenPencil limit is invalid.");
  }
  return value as number;
}

function validateScale(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < MIN_SCALE ||
    (value as number) > MAX_SCALE
  ) {
    fail("document/invalid-input", "OpenPencil scale is invalid.");
  }
  return value as number;
}

function validateQuality(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isInteger(value) ||
    (value as number) < MIN_QUALITY ||
    (value as number) > MAX_QUALITY
  ) {
    fail("document/invalid-input", "OpenPencil quality is invalid.");
  }
  return value as number;
}

function validateFormat(value: unknown): OpenpencilExportFormat {
  if (typeof value !== "string") {
    fail("document/invalid-input", "OpenPencil format is invalid.");
  }
  const normalized = (value as string).toLowerCase();
  if (
    !OPENPENCIL_EXPORT_FORMATS.includes(normalized as OpenpencilExportFormat)
  ) {
    if (
      ["pdf", "pptx", "html", "jsx", "storybook", "pen", "json"].includes(normalized)
    ) {
      fail(
        "document/unsupported-format",
        `OpenPencil format is not supported in this grain: ${value as string}.`,
      );
    }
    fail("document/invalid-input", "OpenPencil format is invalid.");
  }
  return normalized as OpenpencilExportFormat;
}

export interface ValidatedOpenpencilInput {
  operation: OpenpencilOperation;
  requestor: OpenpencilRequestor;
  inputFile?: string;
  outputFile?: string;
  format?: OpenpencilExportFormat;
  page?: string;
  nodeId?: string;
  selector?: string;
  depth?: number;
  limit?: number;
  scale?: number;
  quality?: number;
}

/** Strict input validation; unknown operations classify as unsupported. */
export function validateOpenpencilInput(raw: unknown): ValidatedOpenpencilInput {
  if (!isRecord(raw)) {
    fail("document/invalid-input", "OpenPencil input is invalid.");
  }
  const requestor = validateRequestor(raw.requestor);
  const operation = raw.operation;
  if (typeof operation !== "string") {
    fail("document/invalid-input", "OpenPencil operation is invalid.");
  }
  if (REFUSED_OPERATIONS.includes(operation as string)) {
    fail(
      "document/unsupported-operation",
      `OpenPencil operation is not supported: ${operation as string}.`,
    );
  }
  if (!OPENPENCIL_OPERATIONS.includes(operation as OpenpencilOperation)) {
    fail(
      "document/unsupported-operation",
      "OpenPencil operation is not supported.",
    );
  }
  // App-bridge options are never accepted: file mode is the only path.
  for (const key of ["document-id", "documentId", "page-id", "pageId", "app", "port", "socket"]) {
    if (raw[key] !== undefined) {
      fail(
        "document/unsupported-operation",
        "OpenPencil app-bridge targeting is not supported.",
      );
    }
  }
  const op = operation as OpenpencilOperation;
  if (op === "tree") {
    if (typeof raw.inputFile !== "string") {
      fail("document/invalid-input", "OpenPencil tree input requires an input file.");
    }
    const page = validatePage(raw.page);
    const depth = validateDepth(raw.depth);
    const extra = ["outputFile", "format", "nodeId", "selector", "limit", "scale", "quality"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("document/invalid-input", "OpenPencil tree input carries unsupported fields.");
      }
    }
    const validated: ValidatedOpenpencilInput = { operation: op, requestor, inputFile: raw.inputFile as string };
    if (page !== undefined) validated.page = page;
    if (depth !== undefined) validated.depth = depth;
    return validated;
  }
  if (op === "node") {
    if (typeof raw.inputFile !== "string") {
      fail("document/invalid-input", "OpenPencil node input requires an input file.");
    }
    const nodeId = validateNodeId(raw.nodeId);
    const extra = ["outputFile", "format", "page", "selector", "depth", "limit", "scale", "quality"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("document/invalid-input", "OpenPencil node input carries unsupported fields.");
      }
    }
    return { operation: op, requestor, inputFile: raw.inputFile as string, nodeId };
  }
  if (op === "query") {
    if (typeof raw.inputFile !== "string") {
      fail("document/invalid-input", "OpenPencil query input requires an input file.");
    }
    const selector = validateSelector(raw.selector);
    const page = validatePage(raw.page);
    const limit = validateLimit(raw.limit);
    const extra = ["outputFile", "format", "nodeId", "depth", "scale", "quality"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("document/invalid-input", "OpenPencil query input carries unsupported fields.");
      }
    }
    const validated: ValidatedOpenpencilInput = {
      operation: op,
      requestor,
      inputFile: raw.inputFile as string,
      selector,
    };
    if (page !== undefined) validated.page = page;
    if (limit !== undefined) validated.limit = limit;
    return validated;
  }
  if (op === "info") {
    if (typeof raw.inputFile !== "string") {
      fail("document/invalid-input", "OpenPencil info input requires an input file.");
    }
    const extra = ["outputFile", "format", "page", "nodeId", "selector", "depth", "limit", "scale", "quality"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("document/invalid-input", "OpenPencil info input carries unsupported fields.");
      }
    }
    return { operation: op, requestor, inputFile: raw.inputFile as string };
  }
  if (op === "export") {
    if (typeof raw.inputFile !== "string" || typeof raw.outputFile !== "string") {
      fail("document/invalid-input", "OpenPencil export input requires input and output files.");
    }
    const format = validateFormat(raw.format);
    const page = validatePage(raw.page);
    const nodeId = raw.nodeId !== undefined ? validateNodeId(raw.nodeId) : undefined;
    const scale = validateScale(raw.scale);
    const quality = validateQuality(raw.quality);
    if (page !== undefined && nodeId !== undefined) {
      fail("document/invalid-input", "OpenPencil export accepts page or node, not both.");
    }
    if ((format === "fig" || format === "svg") && (scale !== undefined || quality !== undefined)) {
      fail("document/invalid-input", "OpenPencil scale/quality apply only to raster exports.");
    }
    if ((format === "png" || format === "jpg" || format === "jpeg" || format === "webp") && quality !== undefined && (format === "png")) {
      fail("document/invalid-input", "OpenPencil quality applies only to JPG/WEBP exports.");
    }
    if (format !== "jpg" && format !== "jpeg" && format !== "webp" && quality !== undefined) {
      fail("document/invalid-input", "OpenPencil quality applies only to JPG/WEBP exports.");
    }
    const extra = ["selector", "depth", "limit"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("document/invalid-input", "OpenPencil export input carries unsupported fields.");
      }
    }
    const validated: ValidatedOpenpencilInput = {
      operation: op,
      requestor,
      inputFile: raw.inputFile as string,
      outputFile: raw.outputFile as string,
      format,
    };
    if (page !== undefined) validated.page = page;
    if (nodeId !== undefined) validated.nodeId = nodeId;
    if (scale !== undefined) validated.scale = scale;
    if (quality !== undefined) validated.quality = quality;
    return validated;
  }
  if (typeof raw.inputFile !== "string" || typeof raw.outputFile !== "string") {
    fail("document/invalid-input", "OpenPencil convert input requires input and output files.");
  }
  const extra = ["format", "page", "nodeId", "selector", "depth", "limit", "scale", "quality"];
  for (const key of extra) {
    if (raw[key] !== undefined) {
      fail("document/invalid-input", "OpenPencil convert input carries unsupported fields.");
    }
  }
  return {
    operation: op,
    requestor,
    inputFile: raw.inputFile as string,
    outputFile: raw.outputFile as string,
  };
}

function scrubbedEnv(): Record<string, string> {
  const allow = new Set(["PATH", "LANG", "LC_ALL", "LC_MESSAGES", "TMPDIR", "HOME"]);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allow.has(key) && typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

export function buildOpenpencilArgs(
  validated: ValidatedOpenpencilInput,
  paths: { inputAbs: string | undefined; outputAbs: string | undefined },
): string[] {
  if (validated.operation === "tree") {
    const args: string[] = ["tree", paths.inputAbs as string, "--json"];
    if (validated.page !== undefined) args.push("--page", validated.page);
    if (validated.depth !== undefined) args.push("--depth", String(validated.depth));
    return args;
  }
  if (validated.operation === "node") {
    return ["node", paths.inputAbs as string, "--id", validated.nodeId as string, "--json"];
  }
  if (validated.operation === "query") {
    const args: string[] = ["query", paths.inputAbs as string, validated.selector as string, "--json"];
    if (validated.page !== undefined) args.push("--page", validated.page);
    if (validated.limit !== undefined) args.push("--limit", String(validated.limit));
    return args;
  }
  if (validated.operation === "info") {
    return ["info", paths.inputAbs as string, "--json"];
  }
  if (validated.operation === "export") {
    const args: string[] = [
      "export",
      paths.inputAbs as string,
      "--format",
      validated.format as string,
      "--output",
      paths.outputAbs as string,
    ];
    if (validated.page !== undefined) args.push("--page", validated.page);
    if (validated.nodeId !== undefined) args.push("--node", validated.nodeId);
    if (validated.scale !== undefined) args.push("--scale", String(validated.scale));
    if (validated.quality !== undefined) args.push("--quality", String(validated.quality));
    return args;
  }
  return [
    "convert",
    paths.inputAbs as string,
    "--output",
    paths.outputAbs as string,
    "--format",
    "fig",
  ];
}

export function validateOpenpencilSvgOutput(svg: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(svg, "utf8");
  if (bytes === 0 || bytes > maxBytes) {
    fail("document/output-limit", "OpenPencil SVG output exceeds its byte budget.");
  }
  const head = svg.slice(0, 2_048).toLowerCase();
  const hasSvgOpen = head.includes("<svg");
  if (!hasSvgOpen || !svg.toLowerCase().includes("</svg>")) {
    fail("document/malformed-output", "OpenPencil SVG output is malformed.");
  }
  const lowered = svg.toLowerCase();
  if (
    lowered.includes("<script") ||
    lowered.includes("javascript:") ||
    lowered.includes("<foreignobject") ||
    lowered.includes("<!entity") ||
    lowered.includes("<?import")
  ) {
    fail("document/malformed-output", "OpenPencil SVG output carries unsafe content.");
  }
  if (hasSvgEventHandlerAttribute(svg)) {
    fail("document/malformed-output", "OpenPencil SVG output carries unsafe content.");
  }
}

export interface OpenpencilSvgInspection {
  width: number;
  height: number;
  shapes: number;
}

/** Deterministic reopen check: parse dimensions and count basic shapes. */
export function inspectOpenpencilSvg(svg: string): OpenpencilSvgInspection {
  validateOpenpencilSvgOutput(svg, MAX_MAX_OUTPUT_BYTES);
  const { width, height } = inspectSvgDimensionsLinear(svg);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    fail("document/malformed-output", "OpenPencil SVG dimensions are invalid.");
  }
  const shapes = (svg.match(/<(rect|circle|ellipse|path|line|polyline|polygon|g)\b/gi) ?? []).length;
  return { width: width as number, height: height as number, shapes };
}

export interface PenTokenInput {
  colors: string[];
  sizes: number[];
  spacing: number[];
  radius: number[];
}

export interface PenPackReference {
  /** Stable Skilit collection URI that authorized this document. */
  packUri: string;
  workspaceId: string;
}

function validatePenTokens(raw: unknown): PenTokenInput {
  if (!isRecord(raw)) {
    fail("document/invalid-input", "OpenPencil token input is invalid.");
  }
  const colors = raw.colors;
  const sizes = raw.sizes;
  const spacing = raw.spacing;
  const radius = raw.radius;
  if (!Array.isArray(colors) || !Array.isArray(sizes) || !Array.isArray(spacing) || !Array.isArray(radius)) {
    fail("document/invalid-input", "OpenPencil token input is invalid.");
  }
  if (
    (colors as unknown[]).length > 24 ||
    (sizes as unknown[]).length > 24 ||
    (spacing as unknown[]).length > 24 ||
    (radius as unknown[]).length > 24
  ) {
    fail("document/invalid-input", "OpenPencil token input exceeds its budget.");
  }
  for (const color of colors as unknown[]) {
    if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      fail("document/invalid-input", "OpenPencil token color is invalid.");
    }
  }
  for (const group of [sizes, spacing, radius] as unknown[][]) {
    for (const value of group) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 4_096) {
        fail("document/invalid-input", "OpenPencil token dimension is invalid.");
      }
    }
  }
  return {
    colors: [...(colors as string[])].sort(),
    sizes: [...(sizes as number[])].sort((a, b) => a - b),
    spacing: [...(spacing as number[])].sort((a, b) => a - b),
    radius: [...(radius as number[])].sort((a, b) => a - b),
  };
}

function validatePackReference(raw: unknown): PenPackReference {
  if (!isRecord(raw)) {
    fail("document/invalid-input", "OpenPencil pack reference is invalid.");
  }
  if (typeof raw.packUri !== "string" || !SKILIT_URI_PATTERN.test(raw.packUri as string)) {
    fail("document/invalid-input", "OpenPencil pack reference is invalid.");
  }
  const workspaceId = validateId(raw.workspaceId, "workspace identity");
  return { packUri: raw.packUri as string, workspaceId };
}

/**
 * Pure deterministic pack-to-editable-document helper (Skilit-owned, no CLI).
 * Authors a minimal valid `.pen` JSON document (version + frame + rectangle
 * swatches) from qualified design tokens and an authorized reference-pack
 * reference, so the pack -> editable-document -> export -> reopen journey is
 * testable offline. The output is genuine editable-document JSON (parseable
 * by the real `parsePenFile`), not an SVG screenshot.
 */
export function buildPenDocument(raw: unknown): string {
  if (!isRecord(raw)) {
    fail("document/invalid-input", "OpenPencil pen input is invalid.");
  }
  const requestor = validateRequestor(raw.requestor);
  const pack = validatePackReference(raw.pack);
  if (pack.workspaceId !== requestor.workspaceId) {
    fail("document/invalid-input", "OpenPencil pack workspace does not match the requestor.");
  }
  const tokens = validatePenTokens(raw.tokens);
  const colors = tokens.colors.length > 0 ? tokens.colors : ["#000000"];
  const children = colors.slice(0, 24).map((color, index) => ({
    type: "rectangle",
    id: `swatch-${String(index + 1).padStart(2, "0")}`,
    name: `Swatch ${index + 1}`,
    x: (index % 6) * 56,
    y: Math.floor(index / 6) * 56,
    width: 48,
    height: 48,
    fill: color,
  }));
  const document = {
    version: "1",
    children: [
      {
        type: "frame",
        id: "skilit-tokens",
        name: "Skilit Tokens",
        width: 360,
        height: Math.max(56, Math.ceil(children.length / 6) * 56 + 8),
        children,
      },
    ],
  };
  const json = `${JSON.stringify(document, null, 2)}\n`;
  // Honest editability check: valid JSON with at least one editable child.
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail("document/malformed-output", "OpenPencil pen document is malformed.");
  }
  if (!isRecord(parsed) || !Array.isArray((parsed as Record<string, unknown>).children)) {
    fail("document/malformed-output", "OpenPencil pen document is malformed.");
  }
  return json;
}

export interface Availability {
  available: boolean;
  reason: string;
}

/** Explicit capability detection: no spawn, only filesystem checks. */
export async function openpencilAvailability(
  rawConfig: unknown,
): Promise<Availability> {
  const parsed = validateOpenpencilAdapterConfig(rawConfig);
  if (parsed.enabled !== true) {
    return { available: false, reason: "disabled" };
  }
  try {
    await access(parsed.executablePath, constants.X_OK);
  } catch {
    return { available: false, reason: "unavailable" };
  }
  let info;
  try {
    info = await lstat(parsed.executablePath);
  } catch {
    return { available: false, reason: "unavailable" };
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    return { available: false, reason: "unavailable" };
  }
  try {
    const rootReal = await resolveRootReal(parsed.rootDir);
    void rootReal;
  } catch {
    return { available: false, reason: "invalid-root" };
  }
  return { available: true, reason: "ready" };
}

/** Liveness probe that never throws: failures report ok:false instead. */
export async function openpencilHealth(
  rawConfig: unknown,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const availability = await openpencilAvailability(rawConfig);
    if (!availability.available) {
      return { ok: false, detail: availability.reason };
    }
    return { ok: true, detail: "ready" };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Health probe failed.",
    };
  }
}

function provenanceFor(operation: OpenpencilOperation): OpenpencilProvenance {
  return {
    adapterId: OPENPENCIL_ADAPTER_ID,
    capability: OPENPENCIL_CAPABILITY,
    version: OPENPENCIL_PIN,
    egress: "local",
    costClass: "free-local",
    operation,
  };
}

interface SpawnOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function spawnOpenpencil(
  executablePath: string,
  args: readonly string[],
  rootReal: string,
  timeoutMs: number,
  maxOutputBytes: number,
  signal?: AbortSignal,
): Promise<SpawnOutcome> {
  return new Promise<SpawnOutcome>((resolvePromise, rejectPromise) => {
    if (signal?.aborted === true) {
      rejectPromise(
        new OpenpencilAdapterError("document/canceled", "OpenPencil operation was canceled."),
      );
      return;
    }
    const child = execFile(
      executablePath,
      [...args],
      {
        cwd: rootReal,
        timeout: timeoutMs,
        maxBuffer: Math.min(maxOutputBytes, MAX_MAX_OUTPUT_BYTES),
        killSignal: "SIGKILL",
        windowsHide: true,
        shell: false,
        env: scrubbedEnv(),
      },
      (error, stdout, stderr) => {
        if (signal?.aborted === true) {
          rejectPromise(
            new OpenpencilAdapterError("document/canceled", "OpenPencil operation was canceled."),
          );
          return;
        }
        if (error !== null) {
          const typed = error as NodeJS.ErrnoException & {
            code?: string | number | null;
            killed?: boolean;
            signal?: string | null;
          };
          if (typed.code === "ETIMEDOUT" || typed.killed === true) {
            rejectPromise(
              new OpenpencilAdapterError("document/timeout", "OpenPencil operation timed out."),
            );
            return;
          }
          if (typed.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            rejectPromise(
              new OpenpencilAdapterError(
                "document/output-limit",
                "OpenPencil output exceeds its byte budget.",
              ),
            );
            return;
          }
          const exit = typed.code;
          if (typeof exit === "number") {
            rejectPromise(
              new OpenpencilAdapterError(
                "document/failed",
                truncate(`OpenPencil operation failed with exit ${exit}: ${String(stderr).slice(0, 512)}`),
              ),
            );
            return;
          }
          rejectPromise(
            new OpenpencilAdapterError(
              "document/failed",
              truncate(`OpenPencil operation failed: ${error.message}`),
            ),
          );
          return;
        }
        resolvePromise({ stdout: String(stdout), stderr: String(stderr), exitCode: 0 });
      },
    );
    const onAbort = (): void => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Kill failures still settle via the execFile callback.
      }
      rejectPromise(
        new OpenpencilAdapterError("document/canceled", "OpenPencil operation was canceled."),
      );
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function assertInputSize(abs: string): Promise<void> {
  let info;
  try {
    info = await stat(abs);
  } catch {
    fail("document/invalid-input", "OpenPencil input file is unavailable.");
  }
  if ((info as { size: number }).size > MAX_INPUT_BYTES) {
    fail("document/invalid-input", "OpenPencil input file exceeds its size budget.");
  }
}

/**
 * Invoke the configured OpenPencil CLI for one allowlisted file-mode operation.
 * Disabled configurations fail with document/disabled; missing executables
 * fail with document/unavailable; confinement violations fail with
 * document/path-escape. No network, no model, no shell, no app-bridge.
 */
export async function invokeOpenpencil(
  rawInput: unknown,
  rawConfig: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<OpenpencilSuccess> {
  const started = Date.now();
  const parsed = validateOpenpencilAdapterConfig(rawConfig);
  if (parsed.enabled !== true) {
    fail("document/disabled", "OpenPencil adapter is disabled.");
  }
  const config = parsed as ResolvedOpenpencilConfig;
  const timeoutMs =
    options?.timeoutMs !== undefined
      ? validateTimeout(options.timeoutMs, config.timeoutMs)
      : config.timeoutMs;
  if (options?.signal?.aborted === true) {
    fail("document/canceled", "OpenPencil operation was canceled.");
  }
  const validated = validateOpenpencilInput(rawInput);
  let rootReal: string;
  try {
    rootReal = await resolveRootReal(config.rootDir);
  } catch (error) {
    if (error instanceof OpenpencilAdapterError) throw error;
    fail("document/invalid-config", "OpenPencil root directory is unavailable.");
  }
  try {
    await access(config.executablePath, constants.X_OK);
    const info = await lstat(config.executablePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      fail("document/unavailable", "OpenPencil executable is unavailable.");
    }
  } catch (error) {
    if (error instanceof OpenpencilAdapterError) throw error;
    fail("document/unavailable", "OpenPencil executable is unavailable.");
  }
  let inputAbs: string | undefined;
  let outputAbs: string | undefined;
  if (validated.inputFile !== undefined) {
    inputAbs = await resolveConfinedOpenpencilPath(rootReal as string, validated.inputFile, true);
    validateInputExtension(inputAbs);
    await assertInputSize(inputAbs);
    if (validated.operation === "export" || validated.operation === "convert") {
      // Malformed-document gate: .pen inputs must be valid JSON with children
      // before spawning, so corrupt documents fail deterministically.
      if (inputAbs.toLowerCase().endsWith(".pen")) {
        let text: string;
        try {
          text = await readFile(inputAbs, "utf8");
        } catch {
          fail("document/invalid-input", "OpenPencil input file is unavailable.");
        }
        let parsedPen: unknown;
        try {
          parsedPen = JSON.parse(text as string);
        } catch {
          fail("document/malformed-output", "OpenPencil pen document is malformed.");
        }
        if (!isRecord(parsedPen) || !Array.isArray((parsedPen as Record<string, unknown>).children)) {
          fail("document/malformed-output", "OpenPencil pen document is malformed.");
        }
      }
    }
  }
  if (validated.outputFile !== undefined) {
    outputAbs = await resolveConfinedOpenpencilPath(rootReal as string, validated.outputFile, false);
    if (validated.operation === "export") {
      validateOutputExtensionForExport(outputAbs, validated.format as OpenpencilExportFormat);
    }
    if (validated.operation === "convert") {
      if (extname(outputAbs).toLowerCase() !== ".fig") {
        fail(
          "document/unsupported-format",
          "OpenPencil convert output must be a .fig document.",
        );
      }
    }
    if (
      validated.operation === "convert" &&
      inputAbs !== undefined &&
      outputAbs !== undefined &&
      inputAbs === outputAbs
    ) {
      fail("document/invalid-input", "OpenPencil convert refuses to overwrite its input.");
    }
  }
  const args = buildOpenpencilArgs(validated, { inputAbs, outputAbs });
  const outcome = await spawnOpenpencil(
    config.executablePath,
    args,
    rootReal as string,
    timeoutMs,
    config.maxOutputBytes,
    options?.signal,
  );
  if (
    validated.operation === "tree" ||
    validated.operation === "node" ||
    validated.operation === "query" ||
    validated.operation === "info"
  ) {
    const bytes = Buffer.byteLength(outcome.stdout, "utf8");
    if (bytes === 0 || bytes > config.maxOutputBytes) {
      fail("document/output-limit", "OpenPencil output exceeds its byte budget.");
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outcome.stdout);
    } catch {
      fail("document/malformed-output", "OpenPencil output is malformed.");
    }
    return {
      operation: validated.operation,
      stdoutJson: parsedJson,
      provenance: provenanceFor(validated.operation),
      durationMs: Date.now() - started,
    };
  }
  const outPath = outputAbs as string;
  let data: Buffer;
  try {
    data = await readFile(outPath);
  } catch {
    fail("document/malformed-output", "OpenPencil output file is missing.");
  }
  if ((data as Buffer).length === 0 || (data as Buffer).length > config.maxOutputBytes) {
    fail("document/output-limit", "OpenPencil output exceeds its byte budget.");
  }
  if (outPath.toLowerCase().endsWith(".svg")) {
    validateOpenpencilSvgOutput((data as Buffer).toString("utf8"), config.maxOutputBytes);
  }
  const sha256 = createHash("sha256").update(data as Buffer).digest("hex");
  return {
    operation: validated.operation,
    outputFile: outPath,
    outputBytes: (data as Buffer).length,
    outputSha256: sha256,
    provenance: provenanceFor(validated.operation),
    durationMs: Date.now() - started,
  };
}

/** Convenience: is this exact error code an expected deterministic outcome? */
export function isOpenpencilError(error: unknown, code: OpenpencilErrorCode): boolean {
  return error instanceof OpenpencilAdapterError && error.code === code;
}
