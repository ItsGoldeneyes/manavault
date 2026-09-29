/**
 * The `/scan` document is served with COOP/COEP headers so the recognizer
 * worker can use a multi-threaded WASM build (SharedArrayBuffer requires
 * `crossOriginIsolated`). Those headers only apply to a fresh document, so
 * client-side navigation into or out of `/scan` must be a full page load.
 */
export const ISOLATED_PATHS: readonly string[] = ["/scan"]

export function isIsolatedPath(pathname: string) {
  return ISOLATED_PATHS.includes(pathname)
}

/** True when navigating from `from` to `to` crosses the isolation boundary. */
export function isolatedDocumentNavigation(from: string, to: string) {
  return isIsolatedPath(from) !== isIsolatedPath(to)
}

export function isCrossOriginIsolated() {
  return typeof window !== "undefined" && window.crossOriginIsolated === true
}
