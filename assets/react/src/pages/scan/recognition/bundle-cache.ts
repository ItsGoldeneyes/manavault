/**
 * Downloads scanner bundle files once per version and keeps them in Cache Storage, so a
 * scanner start after the first only reads from disk. A new server version gets a new cache
 * and older scanner caches are deleted.
 */

export const SCANNER_CACHE_PREFIX = "manavault-scanner-"

export function scannerCacheName(version: string) {
  return `${SCANNER_CACHE_PREFIX}${version}`
}

type CacheStore = Pick<CacheStorage, "open" | "keys" | "delete">

interface FetchOptions {
  version: string
  /** Expected decoded size; a mismatch fails the download instead of caching it. */
  size?: number
  /** Called with the bytes received so far and the expected total, when known. */
  onProgress?: (loaded: number, total?: number) => void
  cacheStorage?: CacheStore | null
  fetcher?: typeof fetch
}

/** Cache Storage exists only in secure contexts; plain-HTTP pages just fetch. */
function defaultCacheStorage(): CacheStore | null {
  return typeof caches === "undefined" ? null : caches
}

/** File bytes and whether they came from the cache. */
export async function fetchBundleFile(
  url: string,
  {
    version,
    size,
    onProgress,
    cacheStorage = defaultCacheStorage(),
    fetcher = fetch,
  }: FetchOptions,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; cached: boolean }> {
  const cache = await openCache(cacheStorage, version)
  const hit = await cache?.match(url)
  if (hit) {
    const bytes = new Uint8Array(await hit.arrayBuffer())
    if (size === undefined || bytes.byteLength === size) {
      onProgress?.(bytes.byteLength, bytes.byteLength)
      return { bytes, cached: true }
    }
    await cache?.delete(url)
  }

  const response = await fetcher(url, { credentials: "same-origin" })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  // Content-Length is the compressed size for gzipped responses, so the manifest size wins.
  const total = size ?? (Number(response.headers.get("content-length")) || undefined)
  const bytes = await readWithProgress(response, (loaded) => onProgress?.(loaded, total))
  if (size !== undefined && bytes.byteLength !== size) {
    throw new Error(`${url}: expected ${size} bytes, received ${bytes.byteLength}`)
  }
  try {
    await cache?.put(
      url,
      new Response(bytes, {
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/octet-stream",
        },
      }),
    )
  } catch {
    // Quota exceeded or storage disabled: the scanner still works, it just re-downloads.
  }
  return { bytes, cached: false }
}

/** Deletes scanner caches for every version except `keep`. */
export async function pruneBundleCaches(
  keep: string,
  cacheStorage: CacheStore | null = defaultCacheStorage(),
) {
  if (!cacheStorage) return
  try {
    const names = await cacheStorage.keys()
    await Promise.all(
      names
        .filter((name) => name.startsWith(SCANNER_CACHE_PREFIX) && name !== scannerCacheName(keep))
        .map((name) => cacheStorage.delete(name)),
    )
  } catch {
    // Storage can be unavailable; stale caches are only wasted space.
  }
}

async function openCache(cacheStorage: CacheStore | null, version: string) {
  if (!cacheStorage) return null
  try {
    return await cacheStorage.open(scannerCacheName(version))
  } catch {
    return null
  }
}

async function readWithProgress(
  response: Response,
  onProgress?: (loaded: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress?.(bytes.byteLength)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress?.(loaded)
  }
  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
