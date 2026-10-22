import {SOURCE_PAGE_ROWS,SOURCE_REPLY_CHARS,type SourceArchive,type RecordSource,type SourceRow} from '@shared/fileSource';
import {sourceXml} from '@shared/sourceXml';
import {localName,relationships} from '@shared/officeSource';
import {sourceParagraphs} from '@/utils/sourceParagraphs';

export async function openWordSource(archive:SourceArchive,size:number,signal:AbortSignal):Promise<RecordSource>{
  const rels=await relationships(archive,'word/document.xml',signal);
  const styles=new Map<string,{base?:string;level?:number}>();
  if(archive.names.includes('word/styles.xml')){
    let current:string|undefined;
    const parser=sourceXml({open(tag){const name=localName(tag.name);
      if(name==='style'){current=tag.attributes['w:styleId'];if(current)styles.set(current,{});}
      if(current&&name==='basedOn')styles.get(current)!.base=tag.attributes['w:val'];
      if(current&&name==='outlineLvl')styles.get(current)!.level=Number(tag.attributes['w:val']);
    },close(name){if(localName(name)==='style')current=undefined;}});
    parser.write(new TextDecoder().decode(await archive.small('word/styles.xml',4*1024*1024,signal)));parser.close();
  }
  function level(style:string,explicit?:number){
    if(explicit!==undefined)return explicit>=0&&explicit<9?explicit+1:0;
    const seen=new Set<string>();while(style&&!seen.has(style)&&seen.size<64){seen.add(style);const item=styles.get(style);if(item?.level!==undefined)return item.level>=0&&item.level<9?item.level+1:0;style=item?.base??'';}return 0;
  }
  let iterator=sourceParagraphs(archive,'word/document.xml',signal,rels,level),cursor=0,scanned=0,total:number|undefined;
  return {info:{kind:'docx',size},async page(request,operation){
    operation.throwIfAborted();archive.begin();
    if(request.start<cursor){await iterator.return(undefined);iterator=sourceParagraphs(archive,'word/document.xml',signal,rels,level);cursor=0;total=undefined;}
    const rows:SourceRow[]=[];let chars=0,match:number|undefined;
    while(rows.length<Math.min(request.count??SOURCE_PAGE_ROWS,SOURCE_PAGE_ROWS)){
      operation.throwIfAborted();const result=await iterator.next();if(result.done){total=cursor;break;}
      const row=result.value;cursor=row.index+1;scanned=Math.max(scanned,cursor);if(row.index<request.start)continue;
      if(request.query&&match===undefined){if(!row.cells[0].includes(request.query))continue;match=row.index;}
      rows.push(row);chars+=row.cells[0].length;if(chars>SOURCE_REPLY_CHARS)break;
    }
    return {start:rows[0]?.index??request.start,rows,columns:1,scanned,total,more:total===undefined||cursor<total,match};
  },async close(){await iterator.return(undefined);archive.close();styles.clear();}};
}
