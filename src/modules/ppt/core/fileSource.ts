import type {SourceArchive,RecordSource,SourceRow} from '@shared/fileSource';
import {sourceXml} from '@shared/sourceXml';
import {localName,relationships} from '@shared/officeSource';
import {sourceParagraphs} from '@/utils/sourceParagraphs';

export async function openPresentationSource(archive:SourceArchive,size:number,signal:AbortSignal):Promise<RecordSource>{
  const rels=await relationships(archive,'ppt/presentation.xml',signal),sheets:Array<{id:string;name:string}>=[];
  const parser=sourceXml({open(tag){if(localName(tag.name)==='sldId'){const part=rels.get(tag.attributes['r:id']);if(part)sheets.push({id:part,name:'第 '+(sheets.length+1)+' 页'});}}});
  parser.write(new TextDecoder().decode(await archive.small('ppt/presentation.xml',4*1024*1024,signal)));parser.close();
  if(!sheets.length)throw Error('没有可读取的幻灯片。');
  return {info:{kind:'pptx',size,sheets},async page(request,operation){
    operation.throwIfAborted();archive.begin();const part=request.sheet??sheets[0].id;
    if(!sheets.some(s=>s.id===part))throw Error('幻灯片不存在。');
    const relations=await relationships(archive,part,operation),rows:SourceRow[]=[];let chars=0,index=0,limited=false;
    for await(const row of sourceParagraphs(archive,part,operation,relations,()=>0)){
      if(++index>10000)throw Error('单页段落数超过预览预算。');if(row.index<request.start)continue;
      rows.push(row);chars+=row.cells[0].length;if(chars>128*1024||rows.length>=100){limited=true;break;}
    }
    return {start:rows[0]?.index??request.start,rows,columns:1,scanned:index,more:limited,total:limited?undefined:index};
  },close(){archive.close();}};
}
