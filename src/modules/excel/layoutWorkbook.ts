import * as XLSX from 'xlsx';
import {openGridBook,NS,elements,rowElement,editable,mergeRanges,setMerges,checkMerges,encloses,cellsByAddress,putCell,newCell,expandDimension,checkRange} from './gridBook';
import {contains,intersects} from './selection';
export interface LayoutChange {axis:'row'|'column';start:number;end:number;size?:number;sizes?:Record<number,number>;hidden?:boolean;unhideAll?:boolean}
export async function layoutWorkbook(bytes:Uint8Array,sheet:string,op:LayoutChange){
  const book=await openGridBook(bytes),doc=book.sheets.get(sheet)?.doc;if(!doc)throw Error('工作表不存在。');editable(doc);
  if(!op.unhideAll&&(!Number.isInteger(op.start)||!Number.isInteger(op.end)||op.start<0||op.end<op.start||op.end-op.start+1>20000||op.end>=(op.axis==='row'?1048576:16384)))throw Error('行列范围无效或超过一次 20000 行/列。');
  const validate=(value:number)=>{if(!Number.isFinite(value)||value<1||value>(op.axis==='row'?409:255))throw Error(op.axis==='row'?'行高需在 1–409 磅之间。':'列宽需在 1–255 字符之间。');};
  if(op.size!==undefined)validate(op.size);for(const value of Object.values(op.sizes||{}))validate(value);
  if(op.axis==='row'){
    if(op.unhideAll)for(const row of elements(doc,'row'))row.removeAttribute('hidden');
    else for(let r=op.start;r<=op.end;r++){const row=rowElement(doc,r),size=op.sizes?.[r]??op.size;if(size!==undefined){row.setAttribute('ht',String(size));row.setAttribute('customHeight','1');}if(op.hidden!==undefined){if(op.hidden)row.setAttribute('hidden','1');else row.removeAttribute('hidden');}}
  }else{
    let cols=elements(doc,'cols')[0];if(!cols){cols=doc.createElementNS(NS,'cols');doc.documentElement.insertBefore(cols,elements(doc,'sheetData')[0]);}
    if(op.unhideAll)for(const col of Array.from(cols.children))col.removeAttribute('hidden');
    else {
      const original=Array.from(cols.children),result:Element[]=[];
      for(const col of original){const min=Number(col.getAttribute('min'))-1,max=Number(col.getAttribute('max'))-1;for(const [start,end] of [[min,Math.min(max,op.start-1)],[Math.max(min,op.end+1),max]])if(start<=end){const next=col.cloneNode(true) as Element;next.setAttribute('min',String(start+1));next.setAttribute('max',String(end+1));result.push(next);}}
      for(let c=op.start;c<=op.end;c++){const prior=original.find(col=>Number(col.getAttribute('min'))<=c+1&&Number(col.getAttribute('max'))>=c+1),col=prior?.cloneNode(true) as Element||doc.createElementNS(NS,'col');col.setAttribute('min',String(c+1));col.setAttribute('max',String(c+1));const size=op.sizes?.[c]??op.size;if(size!==undefined){col.setAttribute('width',String(size));col.setAttribute('customWidth','1');}if(op.hidden!==undefined){if(op.hidden)col.setAttribute('hidden','1');else col.removeAttribute('hidden');}result.push(col);}
      result.sort((a,b)=>Number(a.getAttribute('min'))-Number(b.getAttribute('min')));cols.replaceChildren(...result);
    }
  }
  return {bytes:await book.finish(),affected:[sheet]};
}
export async function mergeWorkbook(bytes:Uint8Array,sheet:string,range:XLSX.Range,keep:string|undefined,unmerge=false){
  checkRange(range);const book=await openGridBook(bytes),doc=book.sheets.get(sheet)?.doc;if(!doc)throw Error('工作表不存在。');editable(doc,range);checkMerges(doc,range);
  const old=mergeRanges(doc);if(!unmerge&&range.s.r===range.e.r&&range.s.c===range.e.c)throw Error('请选择至少两个单元格。');if(!unmerge&&keep&&!contains(range,keep))throw Error('保留内容的单元格必须位于合并区域内。');
  if(!unmerge){const cells=cellsByAddress(doc),anchor=XLSX.utils.encode_cell(range.s),chosen=cells.get(keep||anchor),first=cells.get(anchor);const retained=chosen?.cloneNode(true) as Element||newCell(doc,range.s);if(first?.hasAttribute('s'))retained.setAttribute('s',first.getAttribute('s')!);else retained.removeAttribute('s');putCell(doc,range.s,retained);
    for(const [address,cell] of cells)if(address!==anchor&&contains(range,address)){for(const node of Array.from(cell.children))if(['f','v','is'].includes(node.localName))node.remove();cell.removeAttribute('t');}
    expandDimension(doc,range);
  }
  setMerges(doc,[...old.filter(m=>!intersects(range,m)),...(unmerge?[]:[range])]);return {bytes:await book.finish(),affected:[sheet]};
}
