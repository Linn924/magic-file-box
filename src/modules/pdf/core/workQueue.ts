/** Renderer-local scheduling: reading precedes background extraction/thumbnails. */
type Work = { priority: number; run: () => Promise<void>; signal?: AbortSignal; cancel?: () => void };
const waiting: Work[] = [];
let active = 0;
let background = 0;
const CONCURRENCY = 2;
function publishQueue(){if(typeof document!=='undefined')document.documentElement.dataset.pdfQueue=JSON.stringify(pdfQueueStats());}
function pump() {
  while (active < CONCURRENCY && waiting.length) {
    waiting.sort((a, b) => a.priority - b.priority);
    // Reserve a lane for reading even while a long background task runs.
    if (waiting[0].priority >= 3 && background >= 1) return;
    const work = waiting.shift()!;
    if (work.signal?.aborted) { work.cancel?.(); continue; }
    const lowPriority = work.priority >= 3;
    active++;
    if (lowPriority) background++;
    publishQueue();
    void work.run().finally(() => { active--; if (lowPriority) background--; publishQueue();pump(); });
  }
}
export function pdfWork<T>(priority: number, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel=()=>{
      const at=waiting.indexOf(work);
      if(at>=0)waiting.splice(at,1);
      signal?.removeEventListener('abort',cancel);
      reject(new DOMException('PDF task cancelled','AbortError'));
    };
    const work: Work = { priority, signal, cancel, run: async () => {
      signal?.removeEventListener('abort',cancel);
      if(signal?.aborted){cancel();return;}
      try { resolve(await run()); } catch (error) { reject(error); }
    } };
    if(signal?.aborted){cancel();return;}
    signal?.addEventListener('abort',cancel,{once:true});
    waiting.push(work);
    publishQueue();
    pump();
  });
}
export function pdfQueueStats() { return { active, background, waiting:waiting.length }; }
export function abortablePdfTask<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T> {
  if(!signal)return promise;
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(new DOMException('PDF task cancelled','AbortError'));
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort)).catch(()=>{});
  });
}
