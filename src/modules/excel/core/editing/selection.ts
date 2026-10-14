import * as XLSX from 'xlsx';
import type {ExcelSelection} from '@shared/excelEditing';
export function singleton(sheet:string,address:string):ExcelSelection{const p=XLSX.utils.decode_cell(address);return {sheet,anchor:p,focus:{...p},mode:'cells'};}
export function intersects(a:XLSX.Range,b:XLSX.Range){return a.s.r<=b.e.r&&a.e.r>=b.s.r&&a.s.c<=b.e.c&&a.e.c>=b.s.c;}
export function selectionRange(selection:ExcelSelection,rows:number,cols:number,merges:XLSX.Range[]=[]){
  const clamp=(p:XLSX.CellAddress)=>({r:Math.max(0,Math.min(rows-1,p.r)),c:Math.max(0,Math.min(cols-1,p.c))}),a=clamp(selection.anchor),b=clamp(selection.focus);
  const range={s:{r:Math.min(a.r,b.r),c:Math.min(a.c,b.c)},e:{r:Math.max(a.r,b.r),c:Math.max(a.c,b.c)}};
  if(['rows','all'].includes(selection.mode)){range.s.c=0;range.e.c=Math.max(0,cols-1);}if(['columns','all'].includes(selection.mode)){range.s.r=0;range.e.r=Math.max(0,rows-1);}
  const started=Date.now();let changed=true;while(changed){changed=false;for(const merge of merges)if(intersects(range,merge)){const s={r:Math.min(range.s.r,merge.s.r),c:Math.min(range.s.c,merge.s.c)},e={r:Math.max(range.e.r,merge.e.r),c:Math.max(range.e.c,merge.e.c)};if(s.r!==range.s.r||s.c!==range.s.c||e.r!==range.e.r||e.c!==range.e.c){range.s=s;range.e=e;changed=true;}}if(Date.now()-started>100)throw Error('合并区域过于复杂，无法安全扩展选区。');}
  return range;
}
export function contains(range:XLSX.Range,address:string){const p=XLSX.utils.decode_cell(address);return p.r>=range.s.r&&p.r<=range.e.r&&p.c>=range.s.c&&p.c<=range.e.c;}
export function regionTargets(range:XLSX.Range,merges:XLSX.Range[],limit=20000){
  if((range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>limit)throw Error('一次区域操作最多 20000 格，请缩小选区。');const result:string[]=[];
  for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){if(merges.some(m=>r>=m.s.r&&r<=m.e.r&&c>=m.s.c&&c<=m.e.c&&(r!==m.s.r||c!==m.s.c)))continue;result.push(XLSX.utils.encode_cell({r,c}));}return result;
}
