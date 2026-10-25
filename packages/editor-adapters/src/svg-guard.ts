/** Bounded, single-pass SVG safety primitives for the two local adapters.
 * This is not a full XML parser or an allowlist sanitizer. Both adapters
 * retain their independent active-content deny rules and byte limits.
 */

function asciiLetter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function asciiWord(character: string): boolean {
  const code = character.charCodeAt(0);
  return asciiLetter(character) || (code >= 48 && code <= 57) || code === 95;
}

/** Equivalent intent to /on[a-z]+\s*=/i without substring regex backtracking. */
export function hasSvgEventHandlerAttribute(svg: string): boolean {
  // 0=no prefix; 1='o'; 2='on'; 3='on'+letters; 4=trailing whitespace.
  let state = 0;
  for (let i = 0; i < svg.length; i += 1) {
    const character = svg[i] ?? "";
    const code = character.charCodeAt(0);
    const lower = code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : character;
    const whitespace = character.trim() === "";
    if (state === 0) {
      if (lower === "o") state = 1;
    } else if (state === 1) {
      if (lower === "n") state = 2;
      else state = lower === "o" ? 1 : 0;
    } else if (state === 2) {
      if (asciiLetter(character)) state = 3;
      else state = lower === "o" ? 1 : 0;
    } else if (state === 3) {
      if (asciiLetter(character)) continue;
      if (whitespace) state = 4;
      else if (character === "=") return true;
      else state = lower === "o" ? 1 : 0;
    } else {
      if (whitespace) continue;
      if (character === "=") return true;
      state = lower === "o" ? 1 : 0;
    }
  }
  return false;
}

function decimalDimensionInTag(
  source: string,
  lowered: string,
  start: number,
  end: number,
  attribute: "width" | "height",
): number {
  const prefix = attribute + '="';
  let at = lowered.indexOf(prefix, start);
  while (at >= 0 && at < end) {
    // Original regex uses a word boundary immediately before the name.
    if ((at === 0 || !asciiWord(source[at - 1] ?? ""))) {
      let pos = at + prefix.length;
      const digitsStart = pos;
      while (pos < end && (source[pos] ?? "") >= "0" && (source[pos] ?? "") <= "9") pos += 1;
      if (pos > digitsStart) {
        if (source[pos] === ".") {
          pos += 1;
          const fracStart = pos;
          while (pos < end && (source[pos] ?? "") >= "0" && (source[pos] ?? "") <= "9") pos += 1;
          if (pos === fracStart) {
            at = lowered.indexOf(prefix, at + 1);
            continue;
          }
        }
        if (source[pos] === '"') return Number(source.slice(digitsStart, pos));
      }
    }
    at = lowered.indexOf(prefix, at + 1);
  }
  return NaN;
}

/** One bounded scan of SVG opening tags, no quadratic regex on repeated '<svg'. */
export function inspectSvgDimensionsLinear(svg: string): { width: number; height: number } {
  // ASCII-only case folding preserves source offsets even when Unicode
  // lowercasing would expand a character (e.g. dotted capital I).
  const lowered = svg.replace(/[A-Z]/g, (character) => character.toLowerCase());
  let start = lowered.indexOf("<svg");
  while (start >= 0) {
    const close = svg.indexOf(">", start + 4);
    const end = close < 0 ? svg.length : close;
    const width = decimalDimensionInTag(svg, lowered, start + 4, end, "width");
    const height = decimalDimensionInTag(svg, lowered, start + 4, end, "height");
    if (Number.isFinite(width) && Number.isFinite(height)) {
      return { width, height };
    }
    // Progress beyond the current tag so repeated '<svg' is O(input bytes).
    start = lowered.indexOf("<svg", end);
    if (start === end) start = lowered.indexOf("<svg", end + 4);
  }
  return { width: NaN, height: NaN };
}
