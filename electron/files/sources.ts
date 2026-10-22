import {ipcMain,type WebContents} from 'electron';
import {open,type FileHandle} from 'node:fs/promises';
import {Readable} from 'node:stream';
import path from 'node:path';
import {trusted} from '../security';
import {canPreviewFile} from './transfers';
import {selectedSourcePath} from './';
import {fileSourceKind,type SourceReader,type SourceInfo,type SourcePage,type SourceRequest,type RecordSource,type SourceArchive} from '@shared/fileSource';
import {openTextRecords} from '@/modules/text/core/fileRecords';
import {openWorkbookSource} from '@/modules/excel/core/workbook/fileSource';
import {openWordSource} from '@/modules/word/core/fileSource';
import {openPresentationSource} from '@/modules/ppt/core/fileSource';
import {imageSize,validateImageSize} from '@/modules/image/core/dimensions';
import {openSourceArchive} from './sourceArchive';

type Source={owner:number;id:string;token:string;controller:AbortController;handle?:FileHandle;reader?:SourceReader;provider?:RecordSource;archive?:SourceArchive;info?:SourceInfo;assets:Map<string,string>;busy:boolean;closed:boolean};
const sources=new Map<string,Source>(),watched=new WeakSet<WebContents>();
let queue=Promise.resolve(),activeReads=0,peakReads=0,bytesRead=0,maxRange=0,assetReads=0,openHandles=0;
const readers:Array<()=>void>=[];
function tokenValue(token:unknown):asserts token is string{if(typeof token!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(token))throw Error('读取任务无效。');}
function owned(owner:number,token:string){tokenValue(token);const source=sources.get(token);if(!source||source.owner!==owner||source.closed||!canPreviewFile(owner,source.id))throw Error('文件读取已关闭或不属于当前窗口。');return source;}
async function close(source:Source){
  if(source.closed)return;source.closed=true;source.controller.abort();if(sources.get(source.token)===source)sources.delete(source.token);
  source.archive?.close();await Promise.resolve(source.provider?.close()).catch(()=>{});if(source.handle){await source.handle.close().catch(()=>{});source.handle=undefined;openHandles--;}source.assets.clear();
}
function watch(sender:WebContents){if(watched.has(sender))return;watched.add(sender);const clear=()=>{for(const source of sources.values())if(source.owner===sender.id)void close(source);};sender.once('destroyed',clear);sender.on('render-process-gone',clear);sender.on('did-start-navigation',event=>{if(event.isMainFrame)clear();});}
async function slot(signal:AbortSignal){
  while(activeReads>=8){if(readers.length>=256)throw Error('读取队列已满，请稍后重试。');await new Promise<void>(resolve=>readers.push(resolve));signal.throwIfAborted();}
  activeReads++;peakReads=Math.max(peakReads,activeReads);
  return ()=>{activeReads--;readers.shift()?.();};
}
function validRequest(value:SourceRequest):SourceRequest{
  if(!value||!Number.isSafeInteger(value.start)||value.start<0||value.start>Number.MAX_SAFE_INTEGER-100)throw Error('起始位置无效。');
  if(value.count!==undefined&&(!Number.isInteger(value.count)||value.count<1||value.count>100))throw Error('读取行数超出预算。');
  if(value.column!==undefined&&(!Number.isInteger(value.column)||value.column<0||value.column>16383))throw Error('列位置无效。');
  if(value.sheet!==undefined&&(typeof value.sheet!=='string'||value.sheet.length>1024))throw Error('分页标识无效。');
  if(value.query!==undefined&&(typeof value.query!=='string'||value.query.length>256))throw Error('查找文字最多 256 个字符。');
  return value;
}
export function sourceStats(){return {sourceSessions:sources.size,sourceHandles:openHandles,sourceReads:activeReads,sourcePeakReads:peakReads,sourceBytesRead:bytesRead,sourceMaxRange:maxRange};}
export function setupFileSources(){
  ipcMain.handle('source:open',async(event,id:string,token:string,encoding?:string)=>{
    trusted(event);tokenValue(token);if(!canPreviewFile(event.sender.id,id))throw Error('来源文件不属于当前窗口。');
    if(sources.has(token)||sources.size>=128||[...sources.values()].filter(s=>s.owner===event.sender.id).length>=16)throw Error('打开的读取任务过多，请关闭闲置文件。');
    watch(event.sender);
    const source:Source={owner:event.sender.id,id,token,controller:new AbortController(),assets:new Map(),busy:false,closed:false};sources.set(token,source);
    try{
      const file=selectedSourcePath(id),handle=await open(file,'r');if(source.closed){await handle.close();throw new DOMException('已取消读取。','AbortError');}source.handle=handle;openHandles++;
      const stat=await handle.stat(),signature=[stat.size,stat.mtimeMs,stat.ctimeMs,stat.ino,stat.dev].join(':');
      if(!stat.isFile()||!Number.isSafeInteger(stat.size))throw Error('请选择可读取的本机文件。');
      const ext=path.extname(file).slice(1).toLowerCase(),kind=fileSourceKind(ext,Math.max(stat.size,64*1024*1024));
      if(!kind)throw Error('此格式暂不支持按需读取。');
      const reader:SourceReader={size:stat.size,ext,async read(offset,length,signal){
        source.controller.signal.throwIfAborted();signal.throwIfAborted();
        if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||length>1024*1024||offset>stat.size)throw Error('读取范围超出单次 1 MiB 预算。');
        const release=await slot(signal);
        try{
          source.controller.signal.throwIfAborted();signal.throwIfAborted();
          const current=await handle.stat();if([current.size,current.mtimeMs,current.ctimeMs,current.ino,current.dev].join(':')!==signature)throw Error('文件已被其他程序修改，请关闭后重新打开。');
          const buffer=Buffer.alloc(Math.min(length,stat.size-offset));maxRange=Math.max(maxRange,buffer.length);
          const result=await handle.read(buffer,0,buffer.length,offset);bytesRead+=result.bytesRead;
          signal.throwIfAborted();source.controller.signal.throwIfAborted();
          const after=await handle.stat();if([after.size,after.mtimeMs,after.ctimeMs,after.ino,after.dev].join(':')!==signature)throw Error('文件已被其他程序修改，请关闭后重新打开。');
          return new Uint8Array(buffer.buffer,buffer.byteOffset,result.bytesRead);
        }finally{release();}
      }};
      source.reader=reader;
      const signal=source.controller.signal;
      let info:SourceInfo={kind,size:reader.size};
      if(kind==='text'||kind==='csv')source.provider=await openTextRecords(reader,signal,encoding);
      else if(kind==='xlsx'||kind==='docx'||kind==='pptx'){
        const archive=await openSourceArchive(reader,signal);source.archive=archive;
        source.provider=kind==='xlsx'?await openWorkbookSource(archive,reader.size,signal):kind==='docx'?await openWordSource(archive,reader.size,signal):await openPresentationSource(archive,reader.size,signal);
      }else if(kind==='image'){
        const size=validateImageSize(imageSize(await reader.read(0,Math.min(reader.size,1024*1024),signal)));
        info={...info,...size,url:'preview://local/__source/'+token+'/raw'};
      }
      signal.throwIfAborted();source.info=source.provider?.info??info;return source.info;
    }catch(error){await close(source);throw error;}
  });
  ipcMain.handle('source:range',async(event,token:string,offset:number,length:number)=>{
    trusted(event);const source=owned(event.sender.id,token);if(source.info?.kind!=='pdf')throw Error('此读取任务不提供文件字节范围。');
    return source.reader!.read(offset,length,source.controller.signal);
  });
  ipcMain.handle('source:page',async(event,token:string,request:SourceRequest)=>{
    trusted(event);const source=owned(event.sender.id,token);validRequest(request);if(!source.provider||source.busy)throw Error('正在读取，请等待或取消当前任务。');
    source.busy=true;
    const run=queue.then(async()=>{
      source.controller.signal.throwIfAborted();await source.reader!.read(0,0,source.controller.signal);
      const page=await source.provider!.page(request,source.controller.signal);
      await source.reader!.read(0,0,source.controller.signal);
      source.controller.signal.throwIfAborted();
      source.assets.clear();
      for(const row of page.rows)if(row.assets)row.assets=row.assets.flatMap(name=>{
        if(!source.archive||!name.match(/\.(png|jpe?g|gif|webp|bmp)$/i)||(source.archive.size(name)??Infinity)>16*1024*1024){row.assetWarning='部分图片缺失或超过单图读取预算，未加载。';return [];}
        if(source.assets.size>=800&&!source.assets.has(name)){row.assetWarning='本段图片数量超过显示预算，部分图片未加载。';return [];}
        source.assets.set(name,name);return ['preview://local/__source/'+token+'/asset/'+encodeURIComponent(name)];
      });
      return page;
    });
    queue=run.then(()=>{},()=>{});
    try{return await run;}finally{source.busy=false;}
  });
  ipcMain.handle('source:close',async(event,token:string)=>{trusted(event);tokenValue(token);const source=sources.get(token);if(source&&source.owner===event.sender.id)await close(source);});
}
function urlSource(url:string){try{const parsed=new URL(url),parts=parsed.pathname.split('/');if(parsed.protocol!=='preview:'||parsed.hostname!=='local'||parts[1]!=='__source')return;const source=sources.get(parts[2]);if(!source||source.closed)return;return {source,part:parts[3],name:decodeURIComponent(parts.slice(4).join('/'))};}catch{return;}}
export const fileSourceRouter={
  allows(owner:number,url:string){const found=urlSource(url);return Boolean(found&&found.source.owner===owner&&canPreviewFile(owner,found.source.id));},
  async fetch(request:Request):Promise<Response|undefined>{
    if(!new URL(request.url).pathname.startsWith('/__source/'))return;
    const found=urlSource(request.url);if(!found)return new Response(null,{status:404});
    const {source,part,name}=found,signal=source.controller.signal;
    const headers={'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'};
    try{
      if(part==='raw'&&source.info?.kind==='image'){
        const stream=Readable.from((async function*(){for(let offset=0;offset<source.reader!.size;){signal.throwIfAborted();const bytes=await source.reader!.read(offset,Math.min(128*1024,source.reader!.size-offset),signal);offset+=bytes.length;yield bytes;}})());
        const header=await source.reader!.read(0,Math.min(1024*1024,source.reader!.size),signal),size=validateImageSize(imageSize(header));
        return new Response(Readable.toWeb(stream) as ReadableStream,{headers:{...headers,'Content-Type':size.mime}});
      }
      if(part==='asset'&&source.assets.has(name)&&source.archive){
        if(assetReads>=2)return new Response(null,{status:429});assetReads++;
        try{const bytes=await source.archive.small(name,16*1024*1024,signal);const size=validateImageSize(imageSize(bytes));return new Response(bytes.slice().buffer,{headers:{...headers,'Content-Type':size.mime}});}finally{assetReads--;}
      }
      return new Response(null,{status:403});
    }catch{return new Response(null,{status:422});}
  },
};
