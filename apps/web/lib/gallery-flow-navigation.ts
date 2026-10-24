/** Product-version → actor-scoped flow explorer navigation.
 *
 * The public URL contains only a stable product-version identifier.
 * It contains no session token or source asset bytes. REST authorization
 * remains entirely on the flow listing endpoint.
 */
const VERSION_URI_PREFIX = "skilit://version/";
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function flowExplorerHref(versionUri: string): string | null {
  if (!versionUri.startsWith(VERSION_URI_PREFIX)) return null;
  const versionId = versionUri.slice(VERSION_URI_PREFIX.length);
  if (!VERSION_ID.test(versionId)) return null;
  return `/flows?productVersionId=${encodeURIComponent(versionId)}`;
}

export function versionFilterFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const versionId = params.get("productVersionId");
  return versionId !== null && VERSION_ID.test(versionId) ? versionId : null;
}
