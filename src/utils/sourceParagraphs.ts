import type {SourceArchive,SourceRow} from '@shared/fileSource';
import {sourceXml} from '@shared/sourceXml';
import {localName} from '@shared/officeSource';

/** Shared paragraph extraction for the bounded Word/PPT content readers. */
export async function* sourceParagraphs(archive:SourceArchive,part:string,signal:AbortSignal,rels:Map<string,string>,level:(style:string,explicit?:number)=>number):AsyncGenerator<SourceRow>{
  const ready:SourceRow[]=[];let depth=0,insideText=false,text='',style='',explicit:number|undefined,index=0;
  let assets=new Set<string>();
  const parser=sourceXml({open(tag){const name=localName(tag.name);
    if(name==='p'){if(depth++===0){text='';style='';explicit=undefined;assets=new Set();}}
    if(!depth){if(name==='blip'){const target=rels.get(tag.attributes['r:embed']);if(target&&/\.(png|jpe?g|gif|webp|bmp)$/i.test(target))ready.push({index:index++,cells:[''],assets:[target]});}return;}
    if(name==='t')insideText=true;
    if(name==='tab')text+='\t';if(name==='br')text+='\n';
    if(name==='pStyle')style=tag.attributes['w:val']||tag.attributes.val||'';
    if(name==='outlineLvl')explicit=Number(tag.attributes['w:val']??tag.attributes.val);
    if(name==='blip'&&assets.size<8){const target=rels.get(tag.attributes['r:embed']);if(target&&/\.(png|jpe?g|gif|webp|bmp)$/i.test(target))assets.add(target);}
  },text(value){if(depth&&insideText){text+=value;if(text.length>1024*1024)throw Error('单个段落超过文字预览预算。');}},close(tag){const name=localName(tag);
    if(name==='t')insideText=false;
    if(name==='p'&&depth){if(--depth===0)ready.push({index:index++,cells:[text],level:level(style,explicit),assets:[...assets]});else text+='\n';}
  }});
  const decoder=new TextDecoder('utf-8',{fatal:true});
  for await(const chunk of archive.stream(part,signal)){
    parser.write(decoder.decode(chunk,{stream:true}));
    while(ready.length)yield ready.shift()!;
  }
  parser.write(decoder.decode());parser.close();while(ready.length)yield ready.shift()!;
}
