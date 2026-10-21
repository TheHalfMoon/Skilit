/**
 * The destination a sign-in may return to.
 *
 * It is only ever a path inside this application. A value that resolves
 * to another origin is refused, including the "/\" form, which a browser
 * reads as "//" and therefore as another origin.
 */
export function safeDestination(raw: string | null, origin: string): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  if (!raw.startsWith("/")) return null;
  let base: URL;
  let resolved: URL;
  try {
    base = new URL(origin);
    resolved = new URL(raw, base);
  } catch {
    return null;
  }
  // The comparison is the whole guard: a browser reads a backslash in a
  // path as "//", so "/\evil.example" resolves to another origin and is
  // refused here, exactly as "//evil.example" is.
  if (resolved.origin !== base.origin) return null;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
