import { SaxesParser, type SaxesTagPlain } from 'saxes';

/** Streaming XML events with bounded lexical tokens and no DTD/entity expansion. */
export function sourceXml(handlers:{open?:(tag:SaxesTagPlain)=>void;close?:(name:string)=>void;text?:(text:string)=>void}){
  const parser=new SaxesParser({xmlns:false});
  let mode:'text'|'tag'|'comment'|'cdata'='text',quote='',token=0,prefix='',tail='',depth=0;
  parser.on('doctype',()=>{throw Error('不预览含 DTD 的 Office XML。');});
  parser.on('opentag',tag=>{if(++depth>256)throw Error('XML 嵌套超过结构预算。');handlers.open?.(tag);});
  parser.on('closetag',tag=>{handlers.close?.(tag.name);depth--;});
  parser.on('text',text=>handlers.text?.(text));parser.on('cdata',text=>handlers.text?.(text));
  return {write(text:string){
    for(const c of text){
      if(++token>1024*1024)throw Error('XML 单个文字或标签超过解析预算。');
      if(mode==='text'){if(c==='<'){mode='tag';token=1;prefix='<';quote='';}continue;}
      if(mode==='comment'||mode==='cdata'){
        tail=(tail+c).slice(-3);
        if(tail===(mode==='comment'?'-->':']]>')){mode='text';token=0;tail='';}
        continue;
      }
      if(prefix.length<10)prefix+=c;
      if(prefix==='<!--'){mode='comment';tail='';continue;}
      if(prefix==='<![CDATA['){mode='cdata';tail='';continue;}
      if(/^<!DOCTYPE/i.test(prefix))throw Error('不预览含 DTD 的 Office XML。');
      if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>'){mode='text';token=0;}
    }
    parser.write(text);
  },close(){parser.close();}};
}
