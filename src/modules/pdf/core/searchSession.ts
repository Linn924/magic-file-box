import {getDocument,PDFWorker,GlobalWorkerOptions,type PDFDocumentLoadingTask,type PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {PreviewFile} from '@shared/files';
import {createPdfFileRange} from './fileRange';
import {canonicalPdfText} from './textCache';
import {abortablePdfTask} from './workQueue';

export interface PdfSearchReader {text(page:number):Promise<string>;close():Promise<void>}
const BATCH_PAGES=16,BATCH_BYTES=32*1024*1024;
// At most one independent search parser per renderer; replacement waits for teardown.
let previous=Promise.resolve();
export async function createPdfSearchReader(file:PreviewFile,signal:AbortSignal):Promise<PdfSearchReader>{
  const prior=previous;let unlock!:()=>void;
  previous=new Promise<void>(resolve=>{unlock=resolve;});
  await prior;
  if(signal.aborted){unlock();signal.throwIfAborted();}
  let worker:PDFWorker|undefined,nativeWorker:Worker|undefined,task:PDFDocumentLoadingTask|undefined,doc:PDFDocumentProxy|undefined;
  let range:ReturnType<typeof createPdfFileRange>|undefined,pages=0,closed=false;
  let releaseBatch:Promise<void>|undefined;
  let closing:Promise<void>|undefined;
  async function discard(){
    if(releaseBatch)return releaseBatch;
    const oldTask=task,oldRange=range,oldWorker=worker,oldNative=nativeWorker;
    task=undefined;range=undefined;worker=undefined;nativeWorker=undefined;doc=undefined;pages=0;
    releaseBatch=(async()=>{
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{
        // A broken range can leave PDF.js waiting for a response during destruction.
        // Keep a bounded grace period, then terminate the worker we explicitly own.
        await Promise.race([oldTask?.destroy().catch(()=>{}),new Promise<void>(resolve=>{timer=setTimeout(resolve,1500);})]);
      }finally{clearTimeout(timer);oldWorker?.destroy();oldNative?.terminate();await oldRange?.close();}
    })();
    try{await releaseBatch;}finally{releaseBatch=undefined;}
  }
  function close(){
    if(closing)return closing;
    closed=true;signal.removeEventListener('abort',abort);
    closing=(async()=>{try{await discard();}finally{unlock();}})();return closing;
  }
  const abort=()=>{void close().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  async function open(){
    signal.throwIfAborted();if(closed)throw new DOMException('搜索已取消','AbortError');
    GlobalWorkerOptions.workerSrc=workerUrl;
    nativeWorker=new Worker(workerUrl,{type:'module'});
    worker=PDFWorker.create({port:nativeWorker});
    let rejectFailure!:(error:Error)=>void;
    const failure=new Promise<never>((_,reject)=>{rejectFailure=reject;});
    void failure.catch(()=>{});
    if(file.source?.kind==='pdf')range=createPdfFileRange(file.id,file.source.size,rejectFailure);
    const base=new URL('./pdf-assets/',location.href).href;
    task=getDocument({...(range?{range:range.range,rangeChunkSize:65536,disableAutoFetch:true,disableStream:true}:{data:file.bytes.slice()}),worker,
      password:file.view?.pdfPassword,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',useSystemFonts:true});
    // Every operation races transport failure; it never reaches the reading document's callbacks.
    const loading=range?Promise.race([task.promise,range.failure,failure]):task.promise;
    doc=await abortablePdfTask(loading,signal);signal.throwIfAborted();
  }
  return {
    async text(page){
      signal.throwIfAborted();
      if(releaseBatch)await releaseBatch;
      if(pages>=BATCH_PAGES||(range?.bytesRead()??0)>=BATCH_BYTES)await discard();
      if(!doc)await open();
      const extraction=(async()=>{const source=await doc!.getPage(page);try{return canonicalPdfText(await source.getTextContent());}finally{source.cleanup();}})();
      const text=await abortablePdfTask(range?Promise.race([extraction,range.failure]):extraction,signal);
      signal.throwIfAborted();pages++;return text;
    },close,
  };
}
