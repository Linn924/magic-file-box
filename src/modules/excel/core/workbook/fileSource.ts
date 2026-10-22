import {SOURCE_PAGE_ROWS,SOURCE_PAGE_COLUMNS,SOURCE_REPLY_CHARS,type SourceArchive,type RecordSource,type SourceRow,type SourceRequest,type SourcePage} from '@shared/fileSource';
import {sourceXml} from '@shared/sourceXml';
import {localName,relationships} from '@shared/officeSource';

type RawRow={index:number;cells:Map<number,{value:string;shared:boolean}>};
export async function openWorkbookSource(archive:SourceArchive,size:number,signal:AbortSignal):Promise<RecordSource>{
  const rels=await relationships(archive,'xl/workbook.xml',signal),sheets:Array<{id:string;name:string}>=[];
  const workbook=sourceXml({open(tag){if(localName(tag.name)==='sheet'&&(!tag.attributes.state||tag.attributes.state==='visible')){const id=rels.get(tag.attributes['r:id']);if(id)sheets.push({id,name:tag.attributes.name});}}});
  workbook.write(new TextDecoder().decode(await archive.small('xl/workbook.xml',4*1024*1024,signal)));workbook.close();
  if(!sheets.length)throw Error('没有可读取的工作表。');
  let selected='',column=0,currentColumn=0,cursor=0,scanned=0,columns=1,total:number|undefined;
  let iterator:AsyncGenerator<RawRow>|undefined,operation=signal,buffered:RawRow[]=[];
  const strings=new Map<number,string>();let stringBytes=0;
  async function* rows(name:string):AsyncGenerator<RawRow>{
    const ready:RawRow[]=[];let row:RawRow|undefined,cellColumn=0,nextColumn=0,shared=false,value='',capture=false,chars=0,last=-1,phonetic=0;
    const parser=sourceXml({open(tag){const name=localName(tag.name);
      if(name==='dimension'){const end=(tag.attributes.ref??'').split(':').at(-1)??'';let n=0;for(const c of end.match(/^[A-Z]+/)?.[0]??'')n=n*26+c.charCodeAt(0)-64;if(n>0&&n<=16384)columns=Math.max(columns,n);}
      if(name==='row'){const index=Number(tag.attributes.r||last+2)-1;if(!Number.isSafeInteger(index)||index<0||index>1048575||index<=last)throw Error('工作表行索引无效。');row={index,cells:new Map()};chars=0;last=index;nextColumn=0;}
      if(name==='c'&&row){const ref=tag.attributes.r;let n=nextColumn+1;if(ref){const match=ref.match(/^([A-Z]+)(\d+)$/);if(!match||Number(match[2])!==row.index+1)throw Error('工作表单元格位置无效。');n=0;for(const c of match[1])n=n*26+c.charCodeAt(0)-64;}cellColumn=n-1;nextColumn=n;columns=Math.max(columns,n);if(n>16384)throw Error('工作表列索引超过格式范围。');shared=tag.attributes.t==='s';value='';}
      if(name==='rPh')phonetic++;
      if((name==='v'||name==='t')&&!phonetic)capture=true;
    },text(text){if(capture){chars+=text.length;if(chars>1024*1024)throw Error('工作表单行文字超过预览预算。');if(value.length+text.length>65536)throw Error('单元格文字超过预览预算。');value+=text;}},close(tag){const name=localName(tag);
      if(name==='v'||name==='t')capture=false;
      if(name==='rPh')phonetic--;
      if(name==='c'&&row&&cellColumn>=currentColumn&&cellColumn<currentColumn+SOURCE_PAGE_COLUMNS)row.cells.set(cellColumn,{value,shared});
      if(name==='row'&&row){ready.push(row);row=undefined;}
    }});
    const decoder=new TextDecoder('utf-8',{fatal:true});
    for await(const chunk of archive.stream(name,signal)){
      operation.throwIfAborted();parser.write(decoder.decode(chunk,{stream:true}));
      while(ready.length)yield ready.shift()!;
    }
    parser.write(decoder.decode());parser.close();while(ready.length)yield ready.shift()!;
  }
  async function sharedStrings(wanted:Set<number>){
    const missing=new Set([...wanted].filter(id=>!strings.has(id)));if(!missing.size)return;
    if(!archive.names.includes('xl/sharedStrings.xml'))throw Error('工作簿缺少共享文字。');
    let index=-1,value='',inside=false,capture=false,phonetic=0;
    const parser=sourceXml({open(tag){const name=localName(tag.name);if(name==='si'){index++;inside=missing.has(index);value='';}if(name==='rPh')phonetic++;if(name==='t'&&!phonetic)capture=true;},text(text){if(inside&&capture){value+=text;if(value.length>65536)throw Error('共享文字超过单元格预算。');}},close(tag){const name=localName(tag);if(name==='t')capture=false;if(name==='rPh')phonetic--;if(name==='si'&&inside){strings.set(index,value);stringBytes+=value.length*2;if(stringBytes>16*1024*1024)throw Error('当前区域共享文字超过缓存预算，请减少读取行数。');missing.delete(index);}}});
    const decoder=new TextDecoder('utf-8',{fatal:true});
    for await(const chunk of archive.stream('xl/sharedStrings.xml',operation)){parser.write(decoder.decode(chunk,{stream:true}));if(!missing.size)break;}
    if(missing.size)throw Error('共享文字索引无效或文件不完整。');
  }
  async function next(){const queued=buffered.shift(),item=queued?{value:queued,done:false}:await iterator!.next();if(item.done){total=scanned;return;}cursor=item.value.index+1;scanned=Math.max(scanned,cursor);return item.value;}
  return {info:{kind:'xlsx',size,sheets},async page(request:SourceRequest,requestSignal:AbortSignal):Promise<SourcePage>{
    operation=requestSignal;operation.throwIfAborted();archive.begin();
    const name=request.sheet||sheets[0].id;
    if(!sheets.some(s=>s.id===name))throw Error('工作表不存在。');
    column=request.column??0;
    if(!iterator||name!==selected||request.start<cursor||column!==currentColumn){await iterator?.return(undefined);buffered=[];if(name!==selected)columns=1;selected=name;currentColumn=column;cursor=0;scanned=0;total=undefined;iterator=rows(name);}
    const raw:RawRow[]=[];let chars=0,match:number|undefined;
    while(!raw.length){
      const batch:RawRow[]=[];let batchChars=0;
      while(batch.length<Math.min(request.count??SOURCE_PAGE_ROWS,SOURCE_PAGE_ROWS)){
        const row=await next();if(!row)break;if(row.index<request.start)continue;batch.push(row);batchChars+=[...row.cells.values()].reduce((n,c)=>n+c.value.length,0);if(batchChars>SOURCE_REPLY_CHARS)break;
      }
      if(!batch.length)break;
      const ids=new Set(batch.flatMap(row=>[...row.cells.values()].filter(c=>c.shared).map(c=>Number(c.value))));
      if([...ids].some(id=>!Number.isSafeInteger(id)||id<0))throw Error('共享文字索引无效。');
      await sharedStrings(ids);
      for(let index=0;index<batch.length;index++){
        const row=batch[index];
        for(const cell of row.cells.values())if(cell.shared){cell.value=strings.get(Number(cell.value))!;cell.shared=false;}
        if(request.query&&match===undefined){if(![...row.cells.values()].some(c=>c.value.includes(request.query!)))continue;match=row.index;}
        chars+=[...row.cells.values()].reduce((n,c)=>n+c.value.length,0);raw.push(row);if(chars>SOURCE_REPLY_CHARS){buffered.unshift(...batch.slice(index+1));break;}
      }
      // Rows read ahead but not published must remain reachable on the next request.
      if(raw.length&&raw.at(-1)!.index+1<cursor)cursor=raw.at(-1)!.index+1;
    }
    const output:SourceRow[]=raw.map(row=>({index:row.index,cells:Array.from({length:Math.min(SOURCE_PAGE_COLUMNS,Math.max(1,columns-column))},(_,i)=>row.cells.get(column+i)?.value??'')}));
    while(stringBytes>8*1024*1024&&strings.size){const [id,text]=strings.entries().next().value!;strings.delete(id);stringBytes-=text.length*2;}
    return {start:output[0]?.index??request.start,rows:output,columns,scanned,total,more:total===undefined||cursor<total,match};
  },async close(){await iterator?.return(undefined);buffered=[];strings.clear();archive.close();}};
}
