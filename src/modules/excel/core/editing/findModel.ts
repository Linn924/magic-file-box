import * as XLSX from 'xlsx';
import type {ExcelValue} from '@shared/excelEditing';

export type FindOptions={query:string;caseSensitive:boolean;whole:boolean;source:'display'|'expression'};
export type FindHit={address:string;text:string;value:ExcelValue};
export function createFindMatcher(options:FindOptions){
  const pattern=new RegExp(options.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),options.caseSensitive?'u':'iu');
  return (text:string)=>{if(!options.query)return false;const match=pattern.exec(text);return !!match&&(!options.whole||match.index===0&&match[0].length===text.length);};
}
/** Literal matches only. Keep offsets in the original string, including Unicode. */
export function findSpans(text:string,options:FindOptions){
  if(!options.query)return [];
  const escaped=options.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(escaped,options.caseSensitive?'gu':'giu'),spans:Array<{start:number;end:number}>=[];
  for(const match of text.matchAll(pattern)){if(options.whole&&(match.index!==0||match[0].length!==text.length))continue;spans.push({start:match.index!,end:match.index!+match[0].length});}
  return spans;
}
export function replaceLiteral(text:string,options:FindOptions,replacement:string){const spans=findSpans(text,options);for(const span of spans.reverse())text=text.slice(0,span.start)+replacement+text.slice(span.end);return text;}
export function replacementText(hit:FindHit,options:FindOptions,replacement:string){
  if(options.source==='display'&&hit.value.kind==='formula')throw Error(`${hit.address} 是公式计算结果，请切换到“公式表达式”后替换。`);
  if(options.source==='display'&&hit.value.kind==='number'&&hit.text!==String(hit.value.value))throw Error(`${hit.address} 使用数字格式，请切换到“公式表达式”后替换原始值。`);
  return replaceLiteral(hit.text,options,replacement);
}
export function orderedAddresses(addresses:Iterable<string>,range?:XLSX.Range){return [...new Set(addresses)].filter(a=>/^[A-Z]{1,3}[1-9]\d*$/.test(a)).filter(a=>{if(!range)return true;const p=XLSX.utils.decode_cell(a);return p.r>=range.s.r&&p.r<=range.e.r&&p.c>=range.s.c&&p.c<=range.e.c;}).sort((a,b)=>{const p=XLSX.utils.decode_cell(a),q=XLSX.utils.decode_cell(b);return p.r-q.r||p.c-q.c;});}
