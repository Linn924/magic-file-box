import type { PreviewFile } from "@shared/contracts";

/**
 * Shared loaded-bytes cache for every open tab (batch preview habit).
 * Bytes persist until tab close or 512MB LRU budget.
 */
const cache = new Map<string, PreviewFile>();
let cacheBudgetBytes = 512 * 1024 * 1024;
let cacheBytes = 0;
export function setFileCacheBudget(bytes:number) {
  cacheBudgetBytes=Math.max(1,bytes);
  while(cacheBytes>cacheBudgetBytes&&cache.size>1)cacheDrop(cache.keys().next().value!);
}

export function cachePut(id: string, file: PreviewFile) {
  const prev = cache.get(id);
  if (prev) cacheBytes -= prev.bytes?.byteLength || 0;
  cache.delete(id);
  cache.set(id, file);
  cacheBytes += file.bytes?.byteLength || 0;
  while (cacheBytes > cacheBudgetBytes && cache.size > 1) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest || oldest === id) break;
    const gone = cache.get(oldest);
    cacheBytes -= gone?.bytes?.byteLength || 0;
    cache.delete(oldest);
  }
}

export function cacheGet(id: string): PreviewFile | undefined {
  const hit = cache.get(id);
  if (hit) { cache.delete(id); cache.set(id, hit); }
  return hit;
}

export function cacheDrop(id: string) {
  const gone = cache.get(id);
  cacheBytes -= gone?.bytes?.byteLength || 0;
  cache.delete(id);
}

export function cacheHas(id: string) {
  return cache.has(id);
}

export function cacheStats() {
  return { count: cache.size, bytes: cacheBytes };
}
