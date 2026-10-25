/**
 * AF-10 P14 local vector adapter (Skilit-owned, no donor vendoring).
 *
 * Optional headless adapter for the pinned VectorCraft CLI contract at
 * `6c3f9f60aa69ac151f9908b94cf00a387746eea4` (verified 2026-10-11, MIT OR
 * Apache-2.0). The adapter never vendors donor code, never downloads or
 * installs a binary, never performs network access, and never requires a
 * paid provider. It is disabled unless explicitly configured with an
 * absolute executable path and a confined filesystem root.
 *
 * Verified upstream contract (apps/vectorcraft-cli/src/main.rs, docs/mcp.md):
 * - binary name is `vectorcraft-cli` (never bare `vectorcraft` PATH lookup);
 * - headless batch surface is `convert IN OUT`, `info FILE`, `commands`;
 * - `mcp [--headless] [--automation-read-root DIR] [--automation-write-root DIR]`
 *   confines agent file access with link-following semantics;
 * - `run` executes arbitrary command IDs and is NOT allowlisted here;
 * - `bench`/`perf` are benchmark harnesses and are NOT allowlisted here;
 * - `--connect ADDR` (unauthenticated TCP control) is never used here.
 *
 * Skilit confinement mirrors the upstream root model with a single
 * operator-owned root directory: every input must resolve inside the root,
 * every output must resolve inside the root, links are followed via
 * realpath, and a path that escapes is refused with a deterministic
 * `vector/path-escape` error. Check-then-use has an inherent TOCTOU race
 * against other local software swapping links between validation and
 * spawn; the roots confine this adapter's own invocation rather than
 * defending against a hostile local peer (same caveat as upstream docs).
 *
 * Subprocess safety: execFile with no shell, allowlisted argv only, scrubbed
 * environment (no ambient credentials), cwd confined to the root, bounded
 * timeout with SIGKILL, bounded stdout/output bytes, truncated diagnostics.
 * Untrusted project content is never executed: only the configured binary
 * runs, with fixed subcommands and validated file operands.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, realpath, readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { hasSvgEventHandlerAttribute, inspectSvgDimensionsLinear } from "./svg-guard.ts";

export const VECTOR_ADAPTER_ID = "skilit-vector" as const;
export const VECTOR_CAPABILITY = "vector-export" as const;
/** Exact upstream pin from UPSTREAMS.lock.yml (vectorcraft, ready). */
export const VECTORCRAFT_PIN =
  "6c3f9f60aa69ac151f9908b94cf00a387746eea4" as const;

/** Legacy adapter ID from before the Skilit rebrand; accepted on read. */
export const LEGACY_VECTOR_ADAPTER_ID = "vectorcraft-local" as const;

export const VECTOR_OPERATIONS = ["convert", "info", "commands"] as const;
export type VectorOperation = (typeof VECTOR_OPERATIONS)[number];

/** Operations the real CLI supports but Skilit deliberately refuses. */
const REFUSED_OPERATIONS: readonly string[] = [
  "run",
  "mcp",
  "bench",
  "perf",
];

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MIN_MAX_OUTPUT_BYTES = 1_024;
const MAX_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_PATH_CHARS = 1_024;
const MAX_ID_CHARS = 128;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const MAX_ARTBOARD = 1_000;
const MAX_RANGE_CHARS = 64;
const ERROR_MESSAGE_MAX_CHARS = 2_000;
const RANGE_PATTERN = /^[0-9]+(-[0-9]+)?(,[0-9]+(-[0-9]+)?)*$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
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

export type VectorErrorCode =
  | "vector/disabled"
  | "vector/unavailable"
  | "vector/invalid-config"
  | "vector/invalid-input"
  | "vector/path-escape"
  | "vector/unsupported-operation"
  | "vector/malformed-output"
  | "vector/timeout"
  | "vector/canceled"
  | "vector/failed"
  | "vector/output-limit";

export class VectorAdapterError extends Error {
  readonly code: VectorErrorCode;
  constructor(code: VectorErrorCode, message: string) {
    super(message);
    this.name = "VectorAdapterError";
    this.code = code;
  }
}

function fail(code: VectorErrorCode, message: string): never {
  throw new VectorAdapterError(code, message);
}

function truncate(message: string): string {
  return message.length > ERROR_MESSAGE_MAX_CHARS
    ? message.slice(0, ERROR_MESSAGE_MAX_CHARS)
    : message;
}

export interface VectorRequestor {
  /** Authenticated actor identity; anonymous invocations are refused. */
  actorId: string;
  /** Workspace scope that owns the confined root. */
  workspaceId: string;
}

export interface VectorAdapterConfig {
  /** Master switch. Anything other than literal true is disabled. */
  enabled: boolean;
  /**
   * Absolute path to the operator-installed `vectorcraft-cli` binary.
   * Bare names and PATH lookups are refused to prevent binary hijack.
   */
  executablePath?: string;
  /** Operator-owned confined root for all file operands. */
  rootDir: string;
  /** Per-invocation ceiling in milliseconds. */
  timeoutMs?: number;
  /** Ceiling for produced SVG/JSON bytes. */
  maxOutputBytes?: number;
  /** Must equal VECTORCRAFT_PIN when enabled. */
  versionPin?: string;
}

export interface ResolvedVectorConfig {
  enabled: true;
  executablePath: string;
  rootDir: string;
  rootReal: string;
  timeoutMs: number;
  maxOutputBytes: number;
  versionPin: string;
}

export interface VectorConvertInput {
  operation: "convert";
  requestor: VectorRequestor;
  inputFile: string;
  outputFile: string;
  scale?: number;
  artboard?: number;
  range?: string;
  outlineText?: boolean;
  replaceLossy?: boolean;
}

export interface VectorInfoInput {
  operation: "info";
  requestor: VectorRequestor;
  inputFile: string;
}

export interface VectorCommandsInput {
  operation: "commands";
  requestor: VectorRequestor;
}

export type VectorInput =
  | VectorConvertInput
  | VectorInfoInput
  | VectorCommandsInput;

export interface VectorProvenance {
  adapterId: typeof VECTOR_ADAPTER_ID;
  capability: typeof VECTOR_CAPABILITY;
  version: typeof VECTORCRAFT_PIN;
  egress: "local";
  costClass: "free-local";
  operation: VectorOperation;
}

export interface VectorSuccess {
  operation: VectorOperation;
  /** Absolute confined output path for convert; undefined otherwise. */
  outputFile?: string;
  outputBytes?: number;
  outputSha256?: string;
  /** Parsed JSON for info/commands; undefined for convert. */
  stdoutJson?: unknown;
  provenance: VectorProvenance;
  durationMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ID_CHARS) {
    fail("vector/invalid-input", `Vector ${label} is invalid.`);
  }
  if (!ID_PATTERN.test(value as string)) {
    fail("vector/invalid-input", `Vector ${label} is invalid.`);
  }
  return value as string;
}

function validateRequestor(value: unknown): VectorRequestor {
  if (!isRecord(value)) {
    fail("vector/invalid-input", "Vector requestor is invalid.");
  }
  const actorId = validateId(value.actorId, "actor identity");
  const workspaceId = validateId(value.workspaceId, "workspace identity");
  return { actorId, workspaceId };
}

function validateTimeout(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || (value as number) < MIN_TIMEOUT_MS || (value as number) > MAX_TIMEOUT_MS) {
    fail("vector/invalid-config", "Vector timeout is invalid.");
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
    fail("vector/invalid-config", "Vector output limit is invalid.");
  }
  return value as number;
}

function validateExecutablePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_CHARS) {
    fail("vector/invalid-config", "Vector executable path is invalid.");
  }
  const text = value as string;
  if (text.includes("\0")) {
    fail("vector/invalid-config", "Vector executable path is invalid.");
  }
  if (!isAbsolute(text)) {
    fail(
      "vector/invalid-config",
      "Vector executable path must be absolute; PATH lookup is refused.",
    );
  }
  return text;
}

function validateRootDir(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_CHARS) {
    fail("vector/invalid-config", "Vector root directory is invalid.");
  }
  const text = value as string;
  if (text.includes("\0")) {
    fail("vector/invalid-config", "Vector root directory is invalid.");
  }
  if (!isAbsolute(text)) {
    fail("vector/invalid-config", "Vector root directory must be absolute.");
  }
  return text;
}

/**
 * Validate operator configuration without touching the filesystem.
 * Returns a resolved record when enabled; throws invalid-config otherwise.
 * Disabled configurations do not throw here: callers surface disabled at
 * invocation time so that disabled-by-default is observable, not silent.
 */
export function validateVectorAdapterConfig(
  raw: unknown,
): ResolvedVectorConfig | { enabled: false } {
  if (!isRecord(raw)) {
    fail("vector/invalid-config", "Vector adapter configuration is invalid.");
  }
  if (raw.enabled !== true) {
    return { enabled: false as const };
  }
  const executablePath = validateExecutablePath(raw.executablePath);
  const rootDir = validateRootDir(raw.rootDir);
  const timeoutMs = validateTimeout(raw.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxOutputBytes = validateMaxOutput(raw.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES);
  const versionPin = raw.versionPin;
  if (versionPin !== VECTORCRAFT_PIN) {
    fail(
      "vector/invalid-config",
      "Vector adapter version pin must match the qualified VectorCraft commit.",
    );
  }
  return {
    enabled: true as const,
    executablePath,
    rootDir,
    rootReal: rootDir,
    timeoutMs,
    maxOutputBytes,
    versionPin: VECTORCRAFT_PIN,
  };
}

async function resolveRootReal(rootDir: string): Promise<string> {
  let info;
  try {
    info = await lstat(rootDir);
  } catch {
    fail("vector/invalid-config", "Vector root directory is unavailable.");
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    fail("vector/invalid-config", "Vector root directory must be a real directory.");
  }
  try {
    return await realpath(rootDir);
  } catch {
    fail("vector/invalid-config", "Vector root directory is unavailable.");
  }
}

function rejectDeviceName(abs: string): void {
  const base = abs.split("/").pop() ?? "";
  const stem = base.split(".")[0] ?? "";
  if (WINDOWS_DEVICE_NAMES.includes(stem.toUpperCase())) {
    fail("vector/invalid-input", "Vector file path is invalid.");
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
 * ancestor so `root/link/../outside` and link-to-elsewhere tricks fail
 * closed with path-escape rather than silently writing outside.
 */
export async function resolveConfinedPath(
  rootReal: string,
  userPath: string,
  mustExist: boolean,
): Promise<string> {
  if (typeof userPath !== "string" || userPath.length === 0 || userPath.length > MAX_PATH_CHARS) {
    fail("vector/invalid-input", "Vector file path is invalid.");
  }
  if (userPath.includes("\0")) {
    fail("vector/invalid-input", "Vector file path is invalid.");
  }
  const abs = isAbsolute(userPath) ? resolve(userPath) : resolve(rootReal, userPath);
  rejectDeviceName(abs);
  if (!insideRoot(abs, rootReal)) {
    fail("vector/path-escape", "Vector file path escapes the confined root.");
  }
  if (abs === rootReal) {
    fail("vector/invalid-input", "Vector file path must name a file inside the root.");
  }
  if (mustExist) {
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      fail("vector/invalid-input", "Vector input file is unavailable.");
    }
    if (!insideRoot(real as string, rootReal)) {
      fail("vector/path-escape", "Vector file path escapes the confined root.");
    }
    let info;
    try {
      info = await lstat(real as string);
    } catch {
      fail("vector/invalid-input", "Vector input file is unavailable.");
    }
    if (!info.isFile() || info.isSymbolicLink()) {
      // realpath already resolved the final link; a symlink bit here means
      // the platform reports the resolved path itself as a link, which we
      // refuse to keep link-escape behavior deterministic.
      fail("vector/path-escape", "Vector file path escapes the confined root.");
    }
    return real as string;
  }
  // Output path: nearest existing ancestor must be inside the root, and the
  // remainder must be plain names (no further traversal after a missing dir).
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
        fail("vector/path-escape", "Vector file path escapes the confined root.");
      }
      const leaf = cursor.slice(slash + 1);
      if (leaf === "" || leaf === "." || leaf === "..") {
        fail("vector/path-escape", "Vector file path escapes the confined root.");
      }
      if (leaf.length > 255 || leaf.includes("\0")) {
        fail("vector/invalid-input", "Vector file path is invalid.");
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
    fail("vector/invalid-input", "Vector output path is unavailable.");
  }
  if (!insideRoot(ancestorReal as string, rootReal)) {
    fail("vector/path-escape", "Vector file path escapes the confined root.");
  }
  for (const leaf of missing) {
    if (leaf === ".." || leaf.includes(sep)) {
      fail("vector/path-escape", "Vector file path escapes the confined root.");
    }
  }
  return abs;
}

function validateScale(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < MIN_SCALE || (value as number) > MAX_SCALE) {
    fail("vector/invalid-input", "Vector scale is invalid.");
  }
  return value as number;
}

function validateArtboard(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_ARTBOARD) {
    fail("vector/invalid-input", "Vector artboard is invalid.");
  }
  return value as number;
}

function validateRange(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_RANGE_CHARS) {
    fail("vector/invalid-input", "Vector range is invalid.");
  }
  if (!RANGE_PATTERN.test(value as string)) {
    fail("vector/invalid-input", "Vector range is invalid.");
  }
  return value as string;
}

function validateFlag(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    fail("vector/invalid-input", `Vector ${label} is invalid.`);
  }
  return value as boolean;
}

export interface ValidatedVectorInput {
  operation: VectorOperation;
  requestor: VectorRequestor;
  inputFile?: string;
  outputFile?: string;
  scale?: number;
  artboard?: number;
  range?: string;
  outlineText?: boolean;
  replaceLossy?: boolean;
}

/** Strict input validation; unknown operations classify as unsupported. */
export function validateVectorInput(raw: unknown): ValidatedVectorInput {
  if (!isRecord(raw)) {
    fail("vector/invalid-input", "Vector input is invalid.");
  }
  const requestor = validateRequestor(raw.requestor);
  const operation = raw.operation;
  if (typeof operation !== "string") {
    fail("vector/invalid-input", "Vector operation is invalid.");
  }
  if (REFUSED_OPERATIONS.includes(operation as string)) {
    fail(
      "vector/unsupported-operation",
      `Vector operation is not supported: ${operation as string}.`,
    );
  }
  if (!VECTOR_OPERATIONS.includes(operation as VectorOperation)) {
    fail("vector/unsupported-operation", "Vector operation is not supported.");
  }
  const op = operation as VectorOperation;
  if (op === "commands") {
    const extra = ["inputFile", "outputFile", "scale", "artboard", "range", "outlineText", "replaceLossy"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("vector/invalid-input", "Vector commands input must not carry file operands.");
      }
    }
    return { operation: op, requestor };
  }
  if (op === "info") {
    if (typeof raw.inputFile !== "string") {
      fail("vector/invalid-input", "Vector info input requires an input file.");
    }
    const extra = ["outputFile", "scale", "artboard", "range", "outlineText", "replaceLossy"];
    for (const key of extra) {
      if (raw[key] !== undefined) {
        fail("vector/invalid-input", "Vector info input carries unsupported fields.");
      }
    }
    return { operation: op, requestor, inputFile: raw.inputFile as string };
  }
  if (typeof raw.inputFile !== "string" || typeof raw.outputFile !== "string") {
    fail("vector/invalid-input", "Vector convert input requires input and output files.");
  }
  const scale = validateScale(raw.scale);
  const artboard = validateArtboard(raw.artboard);
  const range = validateRange(raw.range);
  const outlineText = validateFlag(raw.outlineText, "outline flag");
  const replaceLossy = validateFlag(raw.replaceLossy, "replace flag");
  if (artboard !== undefined && range !== undefined) {
    fail("vector/invalid-input", "Vector convert accepts artboard or range, not both.");
  }
  const validated: ValidatedVectorInput = {
    operation: op,
    requestor,
    inputFile: raw.inputFile as string,
    outputFile: raw.outputFile as string,
  };
  if (scale !== undefined) validated.scale = scale;
  if (artboard !== undefined) validated.artboard = artboard;
  if (range !== undefined) validated.range = range;
  if (outlineText !== undefined) validated.outlineText = outlineText;
  if (replaceLossy !== undefined) validated.replaceLossy = replaceLossy;
  return validated;
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

export function buildVectorArgs(
  validated: ValidatedVectorInput,
  paths: { inputAbs: string | undefined; outputAbs: string | undefined },
): string[] {
  if (validated.operation === "commands") return ["commands"];
  if (validated.operation === "info") {
    return ["info", paths.inputAbs as string];
  }
  const args: string[] = ["convert", paths.inputAbs as string, paths.outputAbs as string];
  if (validated.scale !== undefined) {
    args.push("--scale", String(validated.scale));
  }
  if (validated.artboard !== undefined) {
    args.push("--artboard", String(validated.artboard));
  }
  if (validated.range !== undefined) {
    args.push("--range", validated.range);
  }
  if (validated.outlineText === true) args.push("--outline-text");
  if (validated.replaceLossy === true) args.push("--replace-lossy");
  return args;
}

export function validateSvgOutput(svg: string, maxBytes: number): void {
  const bytes = Buffer.byteLength(svg, "utf8");
  if (bytes === 0 || bytes > maxBytes) {
    fail("vector/output-limit", "Vector SVG output exceeds its byte budget.");
  }
  const head = svg.slice(0, 2_048).toLowerCase();
  const hasSvgOpen = head.includes("<svg");
  if (!hasSvgOpen || !svg.toLowerCase().includes("</svg>")) {
    fail("vector/malformed-output", "Vector SVG output is malformed.");
  }
  const lowered = svg.toLowerCase();
  if (
    lowered.includes("<script") ||
    lowered.includes("javascript:") ||
    lowered.includes("<foreignobject") ||
    lowered.includes("<!entity") ||
    lowered.includes("<?import")
  ) {
    fail("vector/malformed-output", "Vector SVG output carries unsafe content.");
  }
  if (hasSvgEventHandlerAttribute(svg)) {
    fail("vector/malformed-output", "Vector SVG output carries unsafe content.");
  }
}

export interface SvgInspection {
  width: number;
  height: number;
  shapes: number;
}

/** Deterministic reopen check: parse dimensions and count basic shapes. */
export function inspectSvg(svg: string): SvgInspection {
  validateSvgOutput(svg, MAX_MAX_OUTPUT_BYTES);
  const { width, height } = inspectSvgDimensionsLinear(svg);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    fail("vector/malformed-output", "Vector SVG dimensions are invalid.");
  }
  const shapes = (svg.match(/<(rect|circle|ellipse|path|line|polyline|polygon|g)\b/gi) ?? []).length;
  return { width: width as number, height: height as number, shapes };
}

export interface TokenSwatchInput {
  colors: string[];
  sizes: number[];
  spacing: number[];
  radius: number[];
}

function validateTokenSwatchInput(raw: unknown): TokenSwatchInput {
  if (!isRecord(raw)) {
    fail("vector/invalid-input", "Vector token input is invalid.");
  }
  const colors = raw.colors;
  const sizes = raw.sizes;
  const spacing = raw.spacing;
  const radius = raw.radius;
  if (!Array.isArray(colors) || !Array.isArray(sizes) || !Array.isArray(spacing) || !Array.isArray(radius)) {
    fail("vector/invalid-input", "Vector token input is invalid.");
  }
  if (
    (colors as unknown[]).length > 24 ||
    (sizes as unknown[]).length > 24 ||
    (spacing as unknown[]).length > 24 ||
    (radius as unknown[]).length > 24
  ) {
    fail("vector/invalid-input", "Vector token input exceeds its budget.");
  }
  for (const color of colors as unknown[]) {
    if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      fail("vector/invalid-input", "Vector token color is invalid.");
    }
  }
  for (const group of [sizes, spacing, radius] as unknown[][]) {
    for (const value of group) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 4_096) {
        fail("vector/invalid-input", "Vector token dimension is invalid.");
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

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Pure deterministic token-to-SVG export (Skilit-owned, no CLI required).
 * Produces a fixed swatch grid from qualified DTCG-style values so the
 * reference-pack -> SVG -> reopen -> Asset journey is testable offline.
 */
export function tokensToSvg(raw: unknown): string {
  const input = validateTokenSwatchInput(raw);
  const swatch = 48;
  const gap = 8;
  const columns = 6;
  const colorRows = Math.max(1, Math.ceil(Math.max(1, input.colors.length) / columns));
  const barRows = Math.max(
    1,
    Math.ceil(
      Math.max(input.sizes.length, input.spacing.length, input.radius.length, 1) / columns,
    ),
  );
  const width = columns * (swatch + gap) + gap;
  const height = colorRows * (swatch + gap) + gap + barRows * (16 + gap) + gap + 24;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  parts.push(`<title>${escapeXml("Skilit token swatches")}</title>`);
  const colors = input.colors.length > 0 ? input.colors : ["#000000"];
  colors.forEach((color, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = gap + col * (swatch + gap);
    const y = gap + row * (swatch + gap);
    parts.push(
      `<rect x="${x}" y="${y}" width="${swatch}" height="${swatch}" fill="${color}"/>`,
    );
  });
  const bars = [
    ...input.sizes.map((value) => ({ value, fill: "#111111" })),
    ...input.spacing.map((value) => ({ value, fill: "#444444" })),
    ...input.radius.map((value) => ({ value, fill: "#888888" })),
  ];
  const baseY = colorRows * (swatch + gap) + gap * 2;
  const list = bars.length > 0 ? bars : [{ value: 8, fill: "#111111" }];
  list.slice(0, 24).forEach((bar, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = gap + col * (swatch + gap);
    const y = baseY + row * (16 + gap);
    const w = Math.max(4, Math.min(swatch, bar.value));
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="12" fill="${bar.fill}"/>`);
  });
  parts.push("</svg>");
  const svg = `${parts.join("")}\n`;
  validateSvgOutput(svg, DEFAULT_MAX_OUTPUT_BYTES);
  return svg;
}

export interface Availability {
  available: boolean;
  reason: string;
}

/** Explicit capability detection: no spawn, only filesystem checks. */
export async function vectorAvailability(rawConfig: unknown): Promise<Availability> {
  const parsed = validateVectorAdapterConfig(rawConfig);
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
export async function vectorHealth(
  rawConfig: unknown,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const availability = await vectorAvailability(rawConfig);
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

function provenanceFor(operation: VectorOperation): VectorProvenance {
  return {
    adapterId: VECTOR_ADAPTER_ID,
    capability: VECTOR_CAPABILITY,
    version: VECTORCRAFT_PIN,
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

function spawnVector(
  executablePath: string,
  args: readonly string[],
  rootReal: string,
  timeoutMs: number,
  maxOutputBytes: number,
  signal?: AbortSignal,
): Promise<SpawnOutcome> {
  return new Promise<SpawnOutcome>((resolvePromise, rejectPromise) => {
    if (signal?.aborted === true) {
      rejectPromise(new VectorAdapterError("vector/canceled", "Vector operation was canceled."));
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
          rejectPromise(new VectorAdapterError("vector/canceled", "Vector operation was canceled."));
          return;
        }
        if (error !== null) {
          const typed = error as NodeJS.ErrnoException & {
            code?: string | number | null;
            killed?: boolean;
            signal?: string | null;
          };
          if (typed.code === "ETIMEDOUT" || typed.killed === true) {
            rejectPromise(new VectorAdapterError("vector/timeout", "Vector operation timed out."));
            return;
          }
          if (typed.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            rejectPromise(
              new VectorAdapterError("vector/output-limit", "Vector output exceeds its byte budget."),
            );
            return;
          }
          const exit = typed.code;
          if (typeof exit === "number") {
            rejectPromise(
              new VectorAdapterError(
                "vector/failed",
                truncate(`Vector operation failed with exit ${exit}: ${String(stderr).slice(0, 512)}`),
              ),
            );
            return;
          }
          rejectPromise(
            new VectorAdapterError("vector/failed", truncate(`Vector operation failed: ${error.message}`)),
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
      rejectPromise(new VectorAdapterError("vector/canceled", "Vector operation was canceled."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Invoke the configured VectorCraft CLI for one allowlisted operation.
 * Disabled configurations fail with vector/disabled; missing executables
 * fail with vector/unavailable; confinement violations fail with
 * vector/path-escape. No network, no model, no shell, no TCP control.
 */
export async function invokeVector(
  rawInput: unknown,
  rawConfig: unknown,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<VectorSuccess> {
  const started = Date.now();
  const parsed = validateVectorAdapterConfig(rawConfig);
  if (parsed.enabled !== true) {
    fail("vector/disabled", "Vector adapter is disabled.");
  }
  const config = parsed as ResolvedVectorConfig;
  const timeoutMs =
    options?.timeoutMs !== undefined
      ? validateTimeout(options.timeoutMs, config.timeoutMs)
      : config.timeoutMs;
  if (options?.signal?.aborted === true) {
    fail("vector/canceled", "Vector operation was canceled.");
  }
  const validated = validateVectorInput(rawInput);
  let rootReal: string;
  try {
    rootReal = await resolveRootReal(config.rootDir);
  } catch (error) {
    if (error instanceof VectorAdapterError) throw error;
    fail("vector/invalid-config", "Vector root directory is unavailable.");
  }
  try {
    await access(config.executablePath, constants.X_OK);
    const info = await lstat(config.executablePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      fail("vector/unavailable", "Vector executable is unavailable.");
    }
  } catch (error) {
    if (error instanceof VectorAdapterError) throw error;
    fail("vector/unavailable", "Vector executable is unavailable.");
  }
  let inputAbs: string | undefined;
  let outputAbs: string | undefined;
  if (validated.inputFile !== undefined) {
    inputAbs = await resolveConfinedPath(rootReal as string, validated.inputFile, true);
  }
  if (validated.outputFile !== undefined) {
    outputAbs = await resolveConfinedPath(rootReal as string, validated.outputFile, false);
  }
  if (
    validated.operation === "convert" &&
    inputAbs !== undefined &&
    outputAbs !== undefined &&
    inputAbs === outputAbs &&
    validated.replaceLossy !== true
  ) {
    fail("vector/invalid-input", "Vector convert refuses to overwrite its input without an explicit flag.");
  }
  const args = buildVectorArgs(validated, { inputAbs, outputAbs });
  const outcome = await spawnVector(
    config.executablePath,
    args,
    rootReal as string,
    timeoutMs,
    config.maxOutputBytes,
    options?.signal,
  );
  if (validated.operation === "commands" || validated.operation === "info") {
    const bytes = Buffer.byteLength(outcome.stdout, "utf8");
    if (bytes === 0 || bytes > config.maxOutputBytes) {
      fail("vector/output-limit", "Vector output exceeds its byte budget.");
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outcome.stdout);
    } catch {
      fail("vector/malformed-output", "Vector output is malformed.");
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
    fail("vector/malformed-output", "Vector output file is missing.");
  }
  if ((data as Buffer).length === 0 || (data as Buffer).length > config.maxOutputBytes) {
    fail("vector/output-limit", "Vector output exceeds its byte budget.");
  }
  if (outPath.toLowerCase().endsWith(".svg")) {
    validateSvgOutput((data as Buffer).toString("utf8"), config.maxOutputBytes);
  }
  const sha256 = createHash("sha256").update(data as Buffer).digest("hex");
  return {
    operation: "convert",
    outputFile: outPath,
    outputBytes: (data as Buffer).length,
    outputSha256: sha256,
    provenance: provenanceFor("convert"),
    durationMs: Date.now() - started,
  };
}

/** Convenience: is this exact error code an expected deterministic outcome? */
export function isVectorError(error: unknown, code: VectorErrorCode): boolean {
  return error instanceof VectorAdapterError && error.code === code;
}
