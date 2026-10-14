import * as XLSX from 'xlsx';
import {parseFormula,formulaReferences} from './formula';
export interface SortKey {column:number;direction:'asc'|'desc'}
export interface TableValue {value?:number|string|boolean|null;error?:string}
const collator=new Intl.Collator('zh-CN',{sensitivity:'base',numeric:false});
export function compareTableValues(a:TableValue,b:TableValue,direction:'asc'|'desc'){
  const blank=(v:TableValue)=>!v.error&&(v.value===null||v.value===undefined||v.value==='');
  if(blank(a)||blank(b))return Number(blank(a))-Number(blank(b));
  const rank=(v:TableValue)=>v.error?3:typeof v.value==='number'?0:typeof v.value==='string'?1:2;
  const order=rank(a)-rank(b)|| (a.error||b.error?collator.compare(a.error||'',b.error||''):typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:typeof a.value==='boolean'&&typeof b.value==='boolean'?Number(a.value)-Number(b.value):collator.compare(String(a.value),String(b.value)));
  return direction==='asc'?order:-order;
}
export function sortedRows(start:number,end:number,keys:SortKey[],value:(row:number,col:number)=>TableValue){
  if(!keys.length||keys.length>8||new Set(keys.map(k=>k.column)).size!==keys.length)throw Error('请选择 1–8 个不重复的排序列。');
  const rows=Array.from({length:end-start+1},(_,i)=>start+i);
  return rows.sort((a,b)=>{for(const key of keys){const result=compareTableValues(value(a,key.column),value(b,key.column),key.direction);if(result)return result;}return a-b;});
}
/** References follow the moved cells, including absolute references, as in a region move. */
export function sortFormula(formula:string,formulaSheet:string,sheet:string,range:XLSX.Range,mapping:Map<number,number>){
  let refs:ReturnType<typeof formulaReferences>;try{refs=formulaReferences(parseFormula(formula));}catch{throw Error('工作簿含无法安全移动的公式，不能排序。');}
  let next=formula;
  for(const ref of refs.reverse()){
    if((ref.sheet||formulaSheet).toLowerCase()!==sheet.toLowerCase())continue;
    const a=XLSX.utils.decode_cell(ref.a.replace(/\$/g,'')),b=XLSX.utils.decode_cell((ref.b||ref.a).replace(/\$/g,'')),lo=Math.min(a.r,b.r),hi=Math.max(a.r,b.r),left=Math.min(a.c,b.c),right=Math.max(a.c,b.c);
    if(right<range.s.c||left>range.e.c||hi<range.s.r||lo>range.e.r)continue;
    let min=Infinity,max=-Infinity,moved=false;
    if(lo<range.s.r){min=lo;max=Math.min(hi,range.s.r-1);}if(hi>range.e.r){min=Math.min(min,Math.max(lo,range.e.r+1));max=hi;}
    for(let r=Math.max(lo,range.s.r);r<=Math.min(hi,range.e.r);r++){const to=mapping.get(r)??r;min=Math.min(min,to);max=Math.max(max,to);if(to!==r)moved=true;}
    if(!moved)continue;
    if(left<range.s.c||right>range.e.c||max-min!==hi-lo)throw Error('关联引用在排序后成为不连续区域，不能安全排序；请扩大范围或调整公式。');
    if(ref.b&&min===lo&&max===hi)continue;
    const encode=(prior:string,p:XLSX.CellAddress)=>{const flags=prior.match(/^(\$?)[A-Za-z]+(\$?)\d+$/)!;return flags[1]+XLSX.utils.encode_col(p.c)+flags[2]+String(p.r+1);};
    const prefix=ref.sheet?`'${ref.sheet.replace(/'/g,"''")}'!`:'';
    const replacement=prefix+encode(ref.a,{r:a.r<=b.r?min:max,c:a.c})+(ref.b?':'+encode(ref.b,{r:a.r<=b.r?max:min,c:b.c}):'');
    next=next.slice(0,ref.start)+replacement+next.slice(ref.end);
  }
  return next;
}
export function parseTableRange(text:string){if(!/^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?$/.test(text.trim()))throw Error('请输入明确区域，例如 A1:D20。');const range=XLSX.utils.decode_range(text.trim().replace(/\$/g,'').toUpperCase());if(range.s.r>range.e.r||range.s.c>range.e.c||range.e.r>=1048576||range.e.c>=16384||(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>20000)throw Error('区域无效或超过一次 20000 格。');return range;}
