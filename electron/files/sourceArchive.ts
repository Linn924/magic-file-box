import { Readable } from 'node:stream';
import { RandomAccessReader, fromRandomAccessReader, type ZipFile, type Entry } from 'yauzl';
import type { SourceReader, SourceArchive } from '@shared/fileSource';

const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc(bytes:Uint8Array,value:number){for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);return value>>>0;}
export async function openSourceArchive(reader:SourceReader,signal:AbortSignal):Promise<SourceArchive>{
  class Access extends RandomAccessReader {
    _readStreamForRange(start:number,end:number):Readable {
      return Readable.from((async function*(){
        while(start<end){signal.throwIfAborted();const data=await reader.read(start,Math.min(128*1024,end-start),signal);if(!data.length)throw Error('ZIP 内容不完整。');start+=data.length;yield Buffer.from(data.buffer,data.byteOffset,data.length);}
      })());
    }
  }
  const zip=await new Promise<ZipFile>((resolve,reject)=>fromRandomAccessReader(new Access(),reader.size,{lazyEntries:true,autoClose:false,strictFileNames:true,validateEntrySizes:true},(error,value)=>error?reject(error):resolve(value)));
  const entries=new Map<string,Entry>(),active=new Set<Readable>();
  let nameBytes=0,decoded=0,closed=false;
  const close=()=>{if(closed)return;closed=true;for(const stream of active)stream.destroy();active.clear();zip.close();};
  const cancel=()=>close();signal.addEventListener('abort',cancel,{once:true});
  try {
    await new Promise<void>((resolve,reject)=>{
      const aborted=()=>reject(signal.reason);
      signal.addEventListener('abort',aborted,{once:true});
      const cleanup=()=>signal.removeEventListener('abort',aborted);
      zip.on('error',error=>{cleanup();reject(error);});zip.once('end',()=>{cleanup();resolve();});
      zip.on('entry',(entry:Entry)=>{
        try{
          signal.throwIfAborted();nameBytes+=entry.fileName.length*2;
          if(entries.size>=(reader.ext==='pptx'?4000:20000)||nameBytes>4*1024*1024)throw Error('ZIP 目录超过条目或索引内存预算。');
          if(entries.has(entry.fileName)||entry.generalPurposeBitFlag&1)throw Error('ZIP 含重复名称或加密条目，无法安全预览。');
          entries.set(entry.fileName,entry);zip.readEntry();
        }catch(error){cleanup();reject(error);}
      });
      zip.readEntry();
    });
  }catch(error){close();signal.removeEventListener('abort',cancel);throw error;}
  // Later ZIP errors belong to their stream; keep an error listener after enumeration.
  zip.removeAllListeners('error');zip.on('error',()=>{});
  const result:SourceArchive={names:[...entries.keys()],size(name){return entries.get(name)?.uncompressedSize;},begin(){decoded=0;},async *stream(name,operation){
    signal.throwIfAborted();operation.throwIfAborted();if(closed)throw Error('文件读取已取消。');
    const entry=entries.get(name);if(!entry)throw Error('缺少必要的 Office 内容。');
    const input=await new Promise<Readable>((resolve,reject)=>zip.openReadStream(entry,(error,value)=>error?reject(error):resolve(value)));
    if(closed||operation.aborted||signal.aborted){input.destroy();throw new DOMException('已取消读取。','AbortError');}
    active.add(input);let count=0,checksum=0xffffffff;
    const abort=()=>input.destroy(new DOMException('已取消读取。','AbortError'));
    operation.addEventListener('abort',abort,{once:true});
    try{
      for await(const chunk of input){
        operation.throwIfAborted();signal.throwIfAborted();const bytes=chunk as Buffer;
        count+=bytes.length;decoded+=bytes.length;
        if(count>entry.uncompressedSize||decoded>256*1024*1024||reader.ext==='pptx'&&count>32*1024*1024)throw Error('单次解压扫描超过资源预算，请分步浏览文档。');
        checksum=crc(bytes,checksum);yield bytes;
      }
      if(count!==entry.uncompressedSize||((checksum^0xffffffff)>>>0)!==entry.crc32)throw Error('ZIP 内容校验失败，文件可能已损坏。');
    }finally{operation.removeEventListener('abort',abort);active.delete(input);input.destroy();}
  },async small(name,limit,operation){
    const entry=entries.get(name);if(!entry||entry.uncompressedSize>limit)throw Error('Office 元数据超过读取预算或缺失。');
    const chunks:Uint8Array[]=[];let count=0;
    for await(const chunk of result.stream(name,operation)){count+=chunk.length;if(count>limit)throw Error('Office 元数据超过读取预算。');chunks.push(chunk);}
    return new Uint8Array(Buffer.concat(chunks,count));
  },close(){signal.removeEventListener('abort',cancel);close();}};
  return result;
}
