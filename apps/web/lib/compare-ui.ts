/** Pure, unprivileged parsing for the actor-authorized comparison UI.
 * No session tokens, artifact content or rights bypasses live here.
 */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URI_PREFIX = "skilit://artifact/";

export function comparisonArtifactId(input: string): string | null {
  const value = input.trim();
  const id = value.startsWith(URI_PREFIX) ? value.slice(URI_PREFIX.length) : value;
  return ID.test(id) ? id.toLowerCase() : null;
}

export function comparisonPath(left: string, right: string): string | null {
  const leftId = comparisonArtifactId(left);
  const rightId = comparisonArtifactId(right);
  if (leftId === null || rightId === null) return null;
  const query = new URLSearchParams({ left: leftId, right: rightId });
  return `/api/v1/assets/compare?${query.toString()}`;
}

interface Side {
  uri: string;
  kind: string;
  title: string;
  summary: string | null;
  rights: string;
  license: string;
  trademark: boolean;
  serving: string;
  tags: string[];
}

interface FieldDiff {
  field: string;
  left: unknown;
  right: unknown;
}

export interface Comparison {
  left: Side;
  right: Side;
  identical: boolean;
  score: number;
  sharedTerms: string[];
  uniqueLeft: string[];
  uniqueRight: string[];
  fieldDiffs: FieldDiff[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function asSide(value: unknown): Side | null {
  const side = record(value);
  if (
    side === null ||
    typeof side.uri !== "string" || comparisonArtifactId(side.uri) === null ||
    typeof side.kind !== "string" ||
    typeof side.title !== "string" ||
    (side.summary !== null && typeof side.summary !== "string") ||
    typeof side.rights !== "string" ||
    typeof side.license !== "string" ||
    typeof side.trademark !== "boolean" ||
    typeof side.serving !== "string" ||
    !stringList(side.tags)
  ) return null;
  return side as unknown as Side;
}

export function asComparison(value: unknown): Comparison | null {
  const result = record(value);
  if (result === null) return null;
  const left = asSide(result.left);
  const right = asSide(result.right);
  if (left === null || right === null) return null;
  const changes = result.fieldDiffs;
  if (!Array.isArray(changes) || !changes.every((entry) => {
    const item = record(entry);
    return item !== null && typeof item.field === "string" &&
      Object.hasOwn(item, "left") && Object.hasOwn(item, "right");
  })) return null;
  if (
    typeof result.identical !== "boolean" ||
    typeof result.score !== "number" ||
    !Number.isFinite(result.score) || result.score < 0 || result.score > 1 ||
    !stringList(result.sharedTerms) ||
    !stringList(result.uniqueLeft) ||
    !stringList(result.uniqueRight)
  ) return null;
  return {
    left, right, identical: result.identical, score: result.score,
    sharedTerms: result.sharedTerms, uniqueLeft: result.uniqueLeft,
    uniqueRight: result.uniqueRight, fieldDiffs: changes as FieldDiff[],
  };
}

export function comparisonFieldText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "Not specified";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const result = JSON.stringify(value);
  return result ?? "Not specified";
}
