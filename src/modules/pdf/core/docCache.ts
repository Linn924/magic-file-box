import { getDocument, GlobalWorkerOptions, PDFWorker, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { watch } from 'vue';
import { ensurePdfResources, releasePdfResources, pdfResources } from './resources';
import {createPdfFileRange} from './fileRange';
import type {FileSource} from '@shared/fileSource';
type Entry = {
  task: PDFDocumentLoadingTask;
  promise: Promise<PDFDocumentProxy>;
  doc?: PDFDocumentProxy;
  bytes: number;
  users: number;
  retired: boolean;
  /** Loading params included a password (or the doc is already open). */
  withPassword: boolean;
  password?:string;
  destroyed?: boolean;
  idle?: ReturnType<typeof setTimeout>;
  rangeClose?:()=>void;
  failures:Set<(error:Error)=>void>;
};
const cache = new Map<string, Entry>();
const BUDGET_BYTES = 384 * 1024 * 1024;
const MAX_DOCUMENTS = 8;
let cacheBytes = 0;
let leases=0;
let admissions=0;
let sharedWorker:PDFWorker|undefined;
function releaseRegistration(){
  if(!cache.size&&!leases&&!admissions){sharedWorker?.destroy();sharedWorker=undefined;releasePdfResources();}
}
function charge(bytes: number) {
  cacheBytes += bytes;
}
function discharge(bytes: number) {
  cacheBytes = Math.max(0, cacheBytes - bytes);
}
function destroy(entry: Entry) {
  if(entry.destroyed)return;entry.destroyed=true;clearTimeout(entry.idle);
  entry.rangeClose?.();
  void entry.task.destroy().catch(() => {});
}
function evict() {
  for (const [id, entry] of cache) {
    if (cacheBytes <= Math.min(BUDGET_BYTES,pdfResources.value.bytes) && cache.size <= Math.min(MAX_DOCUMENTS,pdfResources.value.documents)) break;
    if (entry.users) continue;
    cache.delete(id);
    discharge(entry.bytes);
    destroy(entry);
  }
  releaseRegistration();
}
/** Detach from the cache map; active readers keep their lease until release. */
function retire(id: string, entry: Entry) {
  if (cache.get(id) !== entry) return;
  cache.delete(id);
  discharge(entry.bytes);
  entry.retired = true;
  if (!entry.users || !entry.doc) destroy(entry);
  releaseRegistration();
}
/** Retire on file close; active readers keep their lease until unmount. */
export function releaseDoc(id: string) {
  const entry = cache.get(id);
  if (!entry) return;
  retire(id, entry);
}
export async function acquireCachedPdf(
  id: string,
  bytes: Uint8Array,
  extra: { cMapUrl?: string; cMapPacked?: boolean; standardFontDataUrl?: string; wasmUrl?: string; password?: string } = {},
  signal?: AbortSignal,
  source?: FileSource,
  onRangeError?: (error:Error)=>void,
) {
  signal?.throwIfAborted();
  GlobalWorkerOptions.workerSrc = workerUrl;
  admissions++;
  try { if(typeof window!=='undefined')await ensurePdfResources(); }
  finally { admissions--; }
  if (signal?.aborted) { releaseRegistration(); signal.throwIfAborted(); }
  const password = extra.password;
  let entry = cache.get(id);
  // Unlock must not reuse a load that never received the password.
  if (entry && password && password!==entry.password && !entry.doc) {
    retire(id, entry);
    entry = undefined;
  }
  if (entry) {
    clearTimeout(entry.idle);
    // Hit: only refresh LRU order. Do not re-charge source bytes.
    cache.delete(id);
    cache.set(id, entry);
  } else {
    let task:PDFDocumentLoadingTask;
    let ranged:ReturnType<typeof createPdfFileRange>|undefined;
    let created:Entry|undefined;
    try {
      if(typeof window!=='undefined'&&!sharedWorker)sharedWorker=new PDFWorker();
      if(source?.kind==='pdf')ranged=createPdfFileRange(id,source.size,error=>{if(created){for(const handler of [...created.failures])handler(error);retire(id,created);destroy(created);}});
      task = getDocument({ ...(ranged?{range:ranged.range,rangeChunkSize:65536,disableAutoFetch:true,disableStream:true}:{data:bytes.slice()}), ...extra, worker:sharedWorker, useSystemFonts: true });
    }
    catch(error){ranged?.close();releaseRegistration();throw error;}
    entry = {
      task,
      promise: ranged?Promise.race([task.promise,ranged.failure]):task.promise,
      bytes: source?Math.min(source.size,128*1024*1024):bytes.byteLength,
      users: 0,
      retired: false,
      withPassword: Boolean(password),
      password,
      rangeClose:ranged?.close,
      failures:new Set(),
    };
    created=entry;
    cache.set(id, entry);
    charge(entry.bytes);
  }
  const held = entry;
  if(onRangeError)held.failures.add(onRangeError);
  held.users++;
  leases++;
  let released = false;
  let onAbort: (() => void) | undefined;
  const release = () => {
    if (released) return;
    released = true;
    if(onRangeError)held.failures.delete(onRangeError);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    held.users--;
    leases--;
    if (held.retired && !held.users) destroy(held);
    else if(!held.users)held.idle=setTimeout(()=>{if(cache.get(id)===held&&!held.users)retire(id,held);},30000);
    evict();
  };
  try {
    const doc = await new Promise<PDFDocumentProxy>((resolve, reject) => {
      onAbort = () => {
        release();
        // Cancel only this caller. Shared readers keep their own loading lease.
        if (!held.users && !held.doc) retire(id, held);
        reject(signal!.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      held.promise.then(resolve, reject);
      if (signal?.aborted) onAbort();
    });
    signal?.throwIfAborted();
    if(held.destroyed)throw new DOMException('PDF loading cancelled','AbortError');
    held.doc = doc;
    held.password=undefined;
    evict();
    return { doc, release };
  } catch (error) {
    if (!signal?.aborted) retire(id, held);
    release();
    throw error;
  }
}
export function cachedPdf(id: string) { return cache.get(id)?.doc; }
/** Test/budget helper: source-byte accounting for idle entries. */
export function docCacheStats() {
  return { count: cache.size, bytes: cacheBytes };
}
watch(pdfResources,evict);
