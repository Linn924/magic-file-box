import * as XLSX from 'xlsx';
import {openGridBook,elements,editable,mergeRanges,cellsByAddress,rowElement,putCell,checkRange} from './gridBook';
import {contains,intersects} from './selection';
import {readBasicWorkbook} from './loadWorkbook';
import {createFormulaCalculator} from './formula';
import {sortedRows,sortFormula,type SortKey,type TableValue} from './tableModel';
export async function sortWorkbook(bytes:Uint8Array,sheet:string,range:XLSX.Range,header:boolean,keys:SortKey[]){
  checkRange(range);
  const start=range.s.r+(header?1:0);if(start>=range.e.r)throw Error('排序至少需要两行数据（标题不计入）。');
  if((range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>20000||range.e.c>=16384||range.e.r>=1048576)throw Error('排序区域超过一次 20000 格或行列上限。');
  if(keys.some(k=>!Number.isInteger(k.column)||k.column<range.s.c||k.column>range.e.c||!['asc','desc'].includes(k.direction)))throw Error('排序列不在区域内。');
  const grid=await openGridBook(bytes),doc=grid.sheets.get(sheet)?.doc;if(!doc)throw Error('工作表不存在。');editable(doc,range);
  if(elements(grid.work,'definedName').some(n=>n.getAttribute('name')!=='_xlnm._FilterDatabase')||Object.keys(grid.zip.files).some(p=>/^xl\/(charts|pivotTables|pivotCache|externalLinks)\//.test(p)))throw Error('工作簿含命名区域、图表、透视表或外部引用，不能安全排序。');
  for(const tag of ['drawing','legacyDrawing','oleObjects','controls','scenarios'])if(elements(doc,tag).length)throw Error('此表含图片、备注或特殊对象，暂不支持移动这些对象的排序。');
  if(elements(doc,'autoFilter').some(f=>elements(f,'filterColumn').length))throw Error('请先清除筛选，再排序全部数据行。');
  const dataRange={s:{r:start,c:range.s.c},e:{...range.e}};
  if(mergeRanges(doc).some(m=>intersects(m,dataRange)))throw Error('排序数据区域含合并单元格，请先取消合并。');
  const cells=cellsByAddress(doc);
  for(const [address,cell] of cells){const p=XLSX.utils.decode_cell(address);if(p.r>=start&&p.r<=range.e.r&&(p.c<range.s.c||p.c>range.e.c)&&cell.children.length)throw Error('区域没有包含这些行的全部非空列，请扩大排序区域，避免打散同行数据。');}
  const book=readBasicWorkbook(bytes,'xlsx'),calculator=createFormulaCalculator(book),values=new Map<string,TableValue>();
  const value=(r:number,c:number):TableValue=>{const addr=XLSX.utils.encode_cell({r,c});if(values.has(addr))return values.get(addr)!;const cell=book.Sheets[sheet]?.[addr];const item=cell?.f?calculator.result(sheet,addr):cell?.t==='e'?{error:XLSX.utils.format_cell(cell)}:{value:cell?.v};if(item.error&&['#LIMIT!','#CYCLE!','#UNSUPPORTED!'].includes(item.error))throw Error('排序列含无法计算的公式，请改选可计算的列。');values.set(addr,item);return item;};
  const order=sortedRows(start,range.e.r,keys,value),mapping=new Map(order.map((from,i)=>[from,start+i])),affected=new Set<string>([sheet]);
  // Validate every affected formula before installing any byte snapshot.
  for(const [name,{doc:current}] of grid.sheets)for(const cell of elements(current,'c'))for(const f of elements(cell,'f')){
    if(f.hasAttribute('t')&&f.getAttribute('t')!=='normal')throw Error('共享、数组或数据表公式不能安全排序。');
    const formula=f.textContent||'',next=sortFormula(formula,name,sheet,dataRange,mapping);if(next!==formula){editable(current);f.textContent=next;for(const v of elements(cell,'v'))v.remove();affected.add(name);}
  }
  const rows=new Map(elements(doc,'row').map(row=>[Number(row.getAttribute('r'))-1,row.cloneNode(true) as Element]));
  for(const cell of elements(doc,'c'))if(contains(dataRange,cell.getAttribute('r')!))cell.remove();
  for(const [from,to] of mapping){const prior=rows.get(from),row=rowElement(doc,to);for(const attr of Array.from(row.attributes))if(!['r'].includes(attr.name))row.removeAttribute(attr.name);if(prior)for(const attr of Array.from(prior.attributes))if(!['r','spans'].includes(attr.name))row.setAttribute(attr.name,attr.value);if(prior)for(const cell of Array.from(prior.children))if(cell.localName==='c'){const pos=XLSX.utils.decode_cell(cell.getAttribute('r')!);if(pos.c>=range.s.c&&pos.c<=range.e.c)putCell(doc,{r:to,c:pos.c},cell.cloneNode(true) as Element);}}
  for(const link of elements(doc,'hyperlink')){const ref=link.getAttribute('ref');if(ref){const next=sortFormula(ref,sheet,sheet,dataRange,mapping);link.setAttribute('ref',next);}}
  for(const [name,{doc:current}] of grid.sheets)for(const link of elements(current,'hyperlink')){const loc=link.getAttribute('location');if(loc){const next=sortFormula(loc,name,sheet,dataRange,mapping);if(next!==loc){link.setAttribute('location',next);affected.add(name);}}}
  for(const state of elements(doc,'sortState'))state.remove();
  return {bytes:await grid.finish(),affected:[...affected]};
}
