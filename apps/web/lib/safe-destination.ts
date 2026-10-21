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
  // The origin comparison alone is not enough. A path whose dot segments
  // normalise away can leave a protocol-relative pathname ("//host")
  // under this origin — "/..//evil.example" resolves to
  // "https://app.example.com//evil.example" — and a browser reads that
  // string as another origin. So the path itself has to be a single
  // leading slash.
  if (resolved.origin !== base.origin) return null;
  const path = resolved.pathname;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return `${path}${resolved.search}${resolved.hash}`;
}
