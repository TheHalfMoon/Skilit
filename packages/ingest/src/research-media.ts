/** Common fail-closed image contract for local curator admission and REST preview. */
export const RESEARCH_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export type ResearchImageType = "image/png" | "image/jpeg" | "image/webp";

const LICENSES = new Set(["CC0-1.0", "MIT", "Apache-2.0", "ISC"]);
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isResearchImageType(value: unknown): value is ResearchImageType {
  return typeof value === "string" && TYPES.has(value);
}

export function isApprovedPreviewLicense(value: unknown): value is string {
  return typeof value === "string" && LICENSES.has(value);
}

/** Signature check, not a complete image decoder; decoding happens in the browser. */
export function matchesDeclaredImageType(bytes: Uint8Array, mediaType: string): boolean {
  if (mediaType === "image/png") {
    return bytes.length >= 24 &&
      Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      Buffer.from(bytes.subarray(12, 16)).toString("ascii") === "IHDR";
  }
  if (mediaType === "image/jpeg") {
    return bytes.length >= 16 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (mediaType === "image/webp") {
    return bytes.length >= 16 &&
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  }
  return false;
}
