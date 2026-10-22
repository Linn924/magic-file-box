import { SOURCE_CHUNK, SOURCE_PAGE_ROWS, SOURCE_PAGE_COLUMNS, SOURCE_REPLY_CHARS, type RecordSource, type SourceReader, type SourceRequest, type SourcePage, type SourceRow } from '@shared/fileSource';

type Checkpoint = { index:number; offset:number; line:number; skipLF:boolean; continued?:boolean };
type Record = { checkpoint:Checkpoint; row:SourceRow };
const encodings = new Set(['utf-8','utf-16le','utf-16be','gb18030']);
export async function openTextRecords(reader:SourceReader, signal:AbortSignal, selectedEncoding?:string):Promise<RecordSource> {
  const head = await reader.read(0, Math.min(SOURCE_CHUNK,reader.size),signal);
  let encoding=selectedEncoding;
  if(encoding&&!encodings.has(encoding))throw Error('不支持此文本编码。');
  if(!encoding){
    encoding=head[0]===255&&head[1]===254?'utf-16le':head[0]===254&&head[1]===255?'utf-16be':'utf-8';
    if(encoding==='utf-8')try{new TextDecoder(encoding,{fatal:true}).decode(head,{stream:true});}catch{encoding='gb18030';}
  }
  const csv=reader.ext==='csv'||reader.ext==='tsv', delimiter=reader.ext==='tsv'?'\t':',';
  const width=encoding.startsWith('utf-16')?2:1, be=encoding==='utf-16be';
  const bom=head[0]===0xef&&head[1]===0xbb&&head[2]===0xbf?3:width===2&&(head[0]===255&&head[1]===254||head[0]===254&&head[1]===255)?2:0;
  const decoder=new TextDecoder(encoding,{fatal:true,ignoreBOM:true});
  const first:Checkpoint={index:0,offset:0,line:1,skipLF:false};
  let checkpoints:Checkpoint[]=[first],stride=256,scanned=0,total:number|undefined,columns=1;
  let cursor=0,iterator=records(first);

  function cells(text:string,column:number):string[]{
    if(!csv)return [text];
    const result:string[]=[];let value='',quoted=false,field=0;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){
        if(quoted&&text[i+1]==='"'){value+='"';i++;}
        else if(quoted||value==='')quoted=!quoted;
        else value+=c;
      }else if(c===delimiter&&!quoted){if(field>=column&&field<column+SOURCE_PAGE_COLUMNS)result.push(value);value='';field++;}
      else value+=c;
    }
    if(quoted)throw Error('CSV 引号未闭合，请检查源文件。');
    if(field>=column&&field<column+SOURCE_PAGE_COLUMNS)result.push(value);
    columns=Math.max(columns,field+1);
    return result;
  }
  async function* records(from:Checkpoint):AsyncGenerator<Record>{
    let index=from.index,line=from.line,offset=from.offset,skipLF=from.skipLF;
    const buffer=new Uint8Array(csv?1024*1024:32*1024+8);
    let used=0,quoted=false,fieldStart=true,continuation=from.continued??false,remaining=0,gbSecond=false,highSurrogate=false;
    while(offset<reader.size){
      signalCheck();
      const bytes=await reader.read(offset,Math.min(SOURCE_CHUNK,reader.size-offset),operationSignal);
      if(!bytes.length)break;
      if(width===2&&bytes.length%2)throw Error('UTF-16 文件的字节长度不完整。');
      for(let pos=0;pos<bytes.length;pos+=width){
        const code=width===1?bytes[pos]:be?(bytes[pos]<<8)|bytes[pos+1]:bytes[pos]|(bytes[pos+1]<<8);
        const next=offset+pos+width;
        if(offset+pos<bom)continue;
        if(skipLF){skipLF=false;if(code===10)continue;}
        if(csv&&code===34){if(quoted)quoted=false;else if(fieldStart){quoted=true;}fieldStart=true;}
        else if(csv&&code===delimiter.charCodeAt(0)&&!quoted)fieldStart=true;
        else if(csv)fieldStart=false;
        if((code===10||code===13)&&!quoted){
          const text=decoder.decode(buffer.subarray(0,used));
          const row:SourceRow={index,cells:[text],line,continued:continuation};
          index++;line++;skipLF=code===13;used=0;continuation=false;fieldStart=true;remaining=0;highSurrogate=false;
          yield {row,checkpoint:{index,offset:next,line,skipLF}};
          continue;
        }
        if(used+width>buffer.length)throw Error('单条 CSV 记录超过 1 MiB 读取预算，请拆分超长记录。');
        buffer[used++]=bytes[pos];if(width===2)buffer[used++]=bytes[pos+1];
        if(width===2)highSurrogate=code>=0xd800&&code<=0xdbff;
        else if(encoding==='utf-8'){
          if(remaining)remaining--;else remaining=code>=0xf0?3:code>=0xe0?2:code>=0xc0?1:0;
        }else if(encoding==='gb18030'){
          if(gbSecond){gbSecond=false;remaining=code>=0x30&&code<=0x39?2:0;}
          else if(remaining)remaining--;else if(code>=0x81&&code<=0xfe)gbSecond=true;
        }
        if(!csv&&used>=32*1024&&!remaining&&!gbSecond&&!highSurrogate){
          const row:SourceRow={index,cells:[decoder.decode(buffer.subarray(0,used))],line,continued:continuation};
          index++;used=0;continuation=true;
          yield {row,checkpoint:{index,offset:next,line,skipLF:false,continued:true}};
        }
      }
      offset+=bytes.length;
    }
    if(quoted)throw Error('CSV 引号未闭合，请检查源文件。');
    if(used){const row:SourceRow={index,cells:[decoder.decode(buffer.subarray(0,used))],line,continued:continuation};index++;yield {row,checkpoint:{index,offset:reader.size,line,skipLF:false}};}
  }
  let operationSignal=signal;
  function signalCheck(){signal.throwIfAborted();operationSignal.throwIfAborted();}
  async function next():Promise<SourceRow|undefined>{
    const value=await iterator.next();
    if(value.done){total=cursor;return;}
    cursor=value.value.checkpoint.index;scanned=Math.max(scanned,cursor);
    if(cursor%stride===0&&cursor>checkpoints[checkpoints.length-1].index){
      checkpoints.push(value.value.checkpoint);
      if(checkpoints.length>32768){stride*=2;checkpoints=checkpoints.filter(c=>c.index%stride===0);}
    }
    return value.value.row;
  }
  async function seek(start:number){
    if(start<cursor){const checkpoint=checkpoints.filter(c=>c.index<=start).reduce((a,b)=>a.index>b.index?a:b,first);await iterator.return(undefined);iterator=records(checkpoint);cursor=checkpoint.index;}
    while(cursor<start){if(!await next())break;}
  }
  return {info:{kind:csv?'csv':'text',size:reader.size,encoding},async page(request:SourceRequest,signal:AbortSignal):Promise<SourcePage>{
    operationSignal=signal;signalCheck();
    const start=request.start,column=request.column??0,count=Math.min(request.count??SOURCE_PAGE_ROWS,SOURCE_PAGE_ROWS);
    await seek(start);
    const rows:SourceRow[]=[];let chars=0,match:number|undefined;
    if(request.query){
      let carry='';
      while(true){const row=await next();if(!row)break;const text=csv?cells(row.cells[0],column).join('\t'):row.cells[0],search=(row.continued?carry:'')+text;
        if(search.includes(request.query)){match=row.index-(row.continued&&search.indexOf(request.query)<carry.length?1:0);await seek(match);break;}
        carry=request.query.length>1?search.slice(-(request.query.length-1)):'';
      }
    }
    while(rows.length<count){
      const row=await next();if(!row)break;
      chars+=row.cells[0].length;
      row.cells=cells(row.cells[0],column);rows.push(row);
      if(chars>=SOURCE_REPLY_CHARS)break;
    }
    return {start:rows[0]?.index??start,rows,more:total===undefined||cursor<total,scanned,total,columns,match};
  },async close(){await iterator.return(undefined);checkpoints=[];}};
}
