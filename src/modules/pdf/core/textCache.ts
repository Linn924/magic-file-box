import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { pdfWork, abortablePdfTask } from "./workQueue";
type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
type Entry={promise:Promise<TextContent>;users:number;done:boolean;weight:number;controller:AbortController};
const documents = new WeakMap<PDFDocumentProxy, Map<number, Entry>>();
export function textCacheLimits(pages:number) {
  return {pages:Math.min(Math.max(32,Math.floor(pages*0.4)),128),bytes:Math.min(Math.max(4*1024*1024,pages*80*1024),16*1024*1024)};
}
function trim(cache:Map<number,Entry>,doc:PDFDocumentProxy) {
  const limits=textCacheLimits(doc.numPages);
  let bytes=[...cache.values()].reduce((sum,e)=>sum+e.weight,0);
  for(const [page,entry] of cache) {
    if(cache.size<=limits.pages&&bytes<=limits.bytes)break;
    if(entry.users)continue;
    cache.delete(page);bytes-=entry.weight;if(!entry.done)entry.controller.abort();
  }
}
/** Share extraction between search and text layers, bounded per document. */
export function pageTextContent(doc: PDFDocumentProxy, page: number, priority = 1, signal?:AbortSignal) {
  let cache = documents.get(doc);
  if (!cache) { cache = new Map(); documents.set(doc, cache); }
  let entry = cache.get(page);
  if (entry) { cache.delete(page); cache.set(page, entry); }
  else {
    const controller=new AbortController();
    const promise=pdfWork(priority, async () => (await doc.getPage(page)).getTextContent(),controller.signal);
    entry={promise,controller,users:0,done:false,weight:0};cache.set(page,entry);
    const held=entry;
    void promise.then(content=>{held.done=true;held.weight=content.items.reduce((sum,item)=>sum+128+('str' in item?item.str.length*2:0),0);trim(cache!,doc);},()=>{if(cache!.get(page)===held)cache!.delete(page);});
  }
  const held=entry;held.users++;
  return abortablePdfTask(held.promise,signal).finally(()=>{
    held.users--;
    if(!held.users&&!held.done){held.controller.abort();if(cache!.get(page)===held)cache!.delete(page);}
    trim(cache!,doc);
  });
}
/** This same map drives extraction and DOM span offsets, including skipped items. */
export function mappedPdfText(content:TextContent) {
  let text='';const items:Array<{index:number;start:number;end:number}>=[];
  content.items.forEach((item,index)=>{
    if(!('str' in item)||!item.str)return;
    if(items.length)text+=' ';
    const start=text.length;text+=item.str;items.push({index,start,end:text.length});
  });
  return {text,items};
}
export function canonicalPdfText(content:TextContent) { return mappedPdfText(content).text; }
