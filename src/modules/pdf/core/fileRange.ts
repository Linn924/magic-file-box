import {PDFDataRangeTransport} from 'pdfjs-dist';
import {openFileSource,fileSourceError} from '@/services/fileSource';
import {pdfResources} from './resources';

/** PDF.js receives only requested ranges. One object and cumulative fetched bytes are bounded. */
export function createPdfFileRange(id:string,size:number,onFailure:(error:Error)=>void){
  const controller=new AbortController(),range=new PDFDataRangeTransport(size,null,true);
  const session=openFileSource({id,size,name:'',ext:'pdf',bytes:new Uint8Array(),error:'',source:{kind:'pdf',size}},controller.signal);
  let failed=false,rejectFailure!:(error:Error)=>void;
  const failure=new Promise<never>((_,reject)=>{rejectFailure=reject;});
  const received=new Set<number>();
  const close=()=>{controller.abort();void session.then(source=>source.close(),()=>{});received.clear();};
  function fail(cause:unknown){if(failed||controller.signal.aborted)return;failed=true;const error=new Error(fileSourceError(cause));rejectFailure(error);onFailure(error);close();}
  void session.catch(fail);
  range.requestDataRange=(begin,end)=>{void(async()=>{
    if(!Number.isSafeInteger(begin)||!Number.isSafeInteger(end)||begin<0||end>size||end<=begin||end-begin>16*1024*1024)throw Error('PDF 单个内容对象超过 16 MiB 读取预算。');
    const budget=Math.min(128*1024*1024,pdfResources.value.bytes);
    const blocks:Array<number>=[];for(let at=Math.floor(begin/65536);at<Math.ceil(end/65536);at++)if(!received.has(at))blocks.push(at);
    if((received.size+blocks.length)*65536>budget)throw Error('PDF 本次读取超过缓存预算，请重新加载后继续当前位置。');
    for(const block of blocks)received.add(block);
    const source=await session,bytes=new Uint8Array(end-begin);
    for(let at=begin;at<end;){controller.signal.throwIfAborted();const data=await source.range(at,Math.min(1024*1024,end-at));if(!data.length)throw Error('PDF 内容不完整。');bytes.set(data,at-begin);at+=data.length;}
    if(!controller.signal.aborted)range.onDataRange(begin,bytes);
  })().catch(fail);};
  range.abort=close;
  return {range,failure,close};
}
