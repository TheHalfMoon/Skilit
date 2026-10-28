/** Transient, browser-only selection of two actor-readable research screens.
 * All real authorization and rights decisions happen again at compare REST.
 */
import { asComparison, comparisonArtifactId, comparisonPath, type Comparison } from "./compare-ui.ts";
import { researchPreviewPath } from "./research-search-ui.ts";

/** Accept only screen artifact URIs sourced from validated search results. */
export function toggleResearchSelection(selected: readonly string[], uri: string): string[] {
  if (typeof uri !== "string" || researchPreviewPath(uri) === null) return [...selected];
  const id = comparisonArtifactId(uri);
  if (id === null) return [...selected];
  if (selected.includes(id)) return selected.filter((candidate) => candidate !== id);
  return selected.length >= 2 ? [...selected] : [...selected, id];
}

/** Prevent duplicate/self-comparison; never include session credentials in URLs. */
export function researchComparisonPath(selected: readonly string[]): string | null {
  if (selected.length !== 2 || selected[0] === selected[1]) return null;
  return comparisonPath(selected[0] ?? "", selected[1] ?? "");
}

/** A server response must correspond exactly to the selected screens. */
export function parseResearchComparison(raw: unknown, selected: readonly string[]): Comparison | null {
  if (researchComparisonPath(selected) === null ||
      raw === null || typeof raw !== "object" || !Object.hasOwn(raw, "result")) return null;
  const parsed = asComparison((raw as { result: unknown }).result);
  if (parsed === null || parsed.left.kind !== "screen" || parsed.right.kind !== "screen" ||
      comparisonArtifactId(parsed.left.uri) !== selected[0] ||
      comparisonArtifactId(parsed.right.uri) !== selected[1]) return null;
  return parsed;
}
