/** UI-only contract for authorized metadata search of research screens.
 * Never fetch images, interpret a license as permission, or construct
 * absolute/external routes from user-provided text.
 */
const ARTIFACT_URI = /^skilit:\/\/artifact\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResearchScreen {
  uri: string;
  kind: "screen";
  title: string;
  rights: string;
  license: string;
  serving: string;
  servingReason: string;
  source: string;
}

export interface ScreenSearchPage {
  screens: ResearchScreen[];
  searchMode: "postgres-fts" | "literal-like";
  cursor: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function researchSearchPath(query: string, cursor?: string): string | null {
  const normalized = query.trim();
  if (normalized.length === 0 || normalized.length > 200) return null;
  if (cursor !== undefined && (cursor.length === 0 || cursor.length > 256)) return null;
  const params = new URLSearchParams({
    query: normalized, kinds: "screen", facets: "true", limit: "20",
  });
  if (cursor !== undefined) params.set("cursor", cursor);
  return `/api/v1/assets?${params.toString()}`;
}

export function parseScreenSearchPage(raw: unknown): ScreenSearchPage | null {
  const envelope = record(raw);
  const result = record(envelope?.result);
  if (envelope === null || result === null || !Array.isArray(result.assets)) return null;
  const mode = result.search_mode;
  if (mode !== "postgres-fts" && mode !== "literal-like") return null;
  const cursor = envelope.cursor;
  if (cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 256)) return null;
  const screens: ResearchScreen[] = [];
  for (const value of result.assets) {
    const item = record(value);
    if (item === null || item.kind !== "screen" ||
        typeof item.uri !== "string" || !ARTIFACT_URI.test(item.uri) ||
        typeof item.title !== "string" ||
        typeof item.rights !== "string" ||
        typeof item.license !== "string" ||
        typeof item.serving !== "string" ||
        typeof item.servingReason !== "string" ||
        typeof item.source !== "string") return null;
    screens.push(item as unknown as ResearchScreen);
  }
  return { screens, searchMode: mode, cursor: cursor ?? null };
}

export function searchFailure(raw: unknown, fallback: string): string {
  const error = record(record(raw)?.error);
  if (error !== null && typeof error.code === "string" && typeof error.message === "string") {
    return `${error.code}: ${error.message}`;
  }
  return fallback;
}
