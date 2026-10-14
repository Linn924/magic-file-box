import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pdfWork,abortablePdfTask } from './workQueue';
export type PageSize={width:number;height:number};
type SizeJob={promise:Promise<PageSize>;controller:AbortController;users:number;done:boolean};
const sizes=new WeakMap<PDFDocumentProxy,Map<number,PageSize>>();
const pending=new WeakMap<PDFDocumentProxy,Map<number,SizeJob>>();
export function cachedPageSize(doc:PDFDocumentProxy,page:number) { return sizes.get(doc)?.get(page); }
export function rememberPageSize(doc:PDFDocumentProxy,page:number,size:PageSize) {
  let cache=sizes.get(doc);if(!cache){cache=new Map();sizes.set(doc,cache);}cache.set(page,size);
}
export function pageSize(doc:PDFDocumentProxy,page:number,priority=3,signal?:AbortSignal) {
  if(signal?.aborted)return Promise.reject(new DOMException('尺寸读取已取消','AbortError'));
  const cached=cachedPageSize(doc,page);if(cached)return Promise.resolve(cached);
  let jobs=pending.get(doc);if(!jobs){jobs=new Map();pending.set(doc,jobs);}
  let entry=jobs.get(page);
  if(!entry){
    const controller=new AbortController();
    const promise=pdfWork(priority,async()=>{const p=await doc.getPage(page);const v=p.getViewport({scale:1});const result={width:v.width,height:v.height};rememberPageSize(doc,page,result);return result;},controller.signal);
    entry={promise,controller,users:0,done:false};jobs.set(page,entry);
    const held=entry;
    void promise.finally(()=>{held.done=true;if(jobs!.get(page)===held)jobs!.delete(page);}).catch(()=>{});
  }
  const held=entry;held.users++;
  return abortablePdfTask(held.promise,signal).finally(()=>{
    held.users--;
    if(!held.users&&!held.done){held.controller.abort();if(jobs!.get(page)===held)jobs!.delete(page);}
  });
}
