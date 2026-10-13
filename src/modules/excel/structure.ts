import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type {ExcelStructure} from '../../../shared/excelEditing';
import {parseFormula,formulaReferences} from './formula';
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function xml(text:string){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('工作簿 XML 无法安全调整。');return doc;}
function all(node:Document|Element,name:string){return Array.from(node.getElementsByTagNameNS(MAIN,name));}
function resolvePart(parent:string,target:string){const parts=(target.startsWith('/')?target.slice(1):parent.slice(0,parent.lastIndexOf('/')+1)+target).split('/'),result:string[]=[];for(const part of parts){if(part==='..')result.pop();else if(part&&part!=='.')result.push(part);}return result.join('/');}
export function moveIndex(value:number,op:ExcelStructure):number|null {
  if(value<op.index)return value;
  if(op.kind==='insert')return value+op.count;
  return value<op.index+op.count?null:value-op.count;
}
export function moveRange(ref:string,op:ExcelStructure){
  const range=XLSX.utils.decode_range(ref),axis=op.axis==='row'?'r':'c';let start=range.s[axis],end=range.e[axis];
  if(op.kind==='insert'){if(start>=op.index)start+=op.count;if(end>=op.index)end+=op.count;}
  else {if(end<op.index){}else if(start>=op.index+op.count){start-=op.count;end-=op.count;}else {start=Math.min(start,op.index);end=end>=op.index+op.count?end-op.count:op.index-1;if(start>end)return null;}}
  range.s[axis]=start;range.e[axis]=end;return XLSX.utils.encode_range(range);
}
export function moveFormula(formula:string,sheet:string,op:ExcelStructure){
  let refs:ReturnType<typeof formulaReferences>;try{refs=formulaReferences(parseFormula(formula));}catch{throw Error('此工作簿含暂不支持调整的公式，请在表格软件中插入或删除行列。');}
  let result=formula;for(const ref of refs.reverse()){
    const {a,b}=ref,target=ref.sheet||sheet;if(target.toLowerCase()!==op.sheet.toLowerCase())continue;
    const original=formula.slice(ref.start,ref.end),prefix=ref.sheet?(original.match(/^(?:'(?:[^']|'')*'|[A-Za-z_\u0080-\uFFFF][\w.\u0080-\uFFFF]*)\s*!/)?.[0]||''):'';
    const moved=moveRange(a.replace(/\$/g,'')+(b?':'+b.replace(/\$/g,''):''),op),range=moved?XLSX.utils.decode_range(moved):undefined;
    const encode=(cell:XLSX.CellAddress,prior:string)=>{const parts=prior.match(/^(\$?)[A-Za-z]+(\$?)\d+$/)!;return parts[1]+XLSX.utils.encode_col(cell.c)+parts[2]+String(cell.r+1);};
    const replacement=!range||range.e.r>=1048576||range.e.c>=16384?prefix+'#REF!':prefix+encode(range.s,a)+(b?':'+encode(range.e,b):'');result=result.slice(0,ref.start)+replacement+result.slice(ref.end);
  }return result;
}
export async function changeStructure(bytes:Uint8Array,op:ExcelStructure){
  if(!Number.isInteger(op.index)||!Number.isInteger(op.count)||op.index<0||op.count<1||op.count>1000)throw Error('位置需为正整数，一次最多调整 1000 行或列。');
  const zip=await JSZip.loadAsync(bytes),work=xml(await zip.file('xl/workbook.xml')!.async('string')),rels=xml(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
  if(work.documentElement.namespaceURI!==MAIN)throw Error('严格格式 XLSX 不支持结构编辑。');
  if(all(work,'definedName').length||Object.keys(zip.files).some(name=>/^xl\/(charts|pivotTables|externalLinks)\//.test(name)))throw Error('此工作簿含命名区域、图表、透视表或外部引用，暂不支持行列调整。');
  const paths=new Map<string,string>();
  for(const sheet of all(work,'sheet')){const relation=Array.from(rels.documentElement.children).find(node=>node.getAttribute('Id')===sheet.getAttributeNS(REL,'id'));if(!relation||relation.getAttribute('TargetMode')==='External')throw Error('不支持该工作表引用。');paths.set(sheet.getAttribute('name')!,resolvePart('xl/workbook.xml',relation.getAttribute('Target')!));}
  const targetPath=paths.get(op.sheet);if(!targetPath)throw Error('工作表不存在。');
  const documents=new Map<string,Document>();const affected=new Set<string>([op.sheet]);
  for(const [name,path] of paths){const entry=zip.file(path);if(!entry)throw Error('工作表结构不完整。');const doc=xml(await entry.async('string'));if(!all(doc,'sheetData').length)throw Error('非普通工作表不支持行列调整。');documents.set(name,doc);
    for(const cell of all(doc,'c'))for(const f of all(cell,'f')){if(f.hasAttribute('t')&&f.getAttribute('t')!=='normal')throw Error('共享、数组或数据表公式不支持结构编辑。');const formula=f.textContent||'',next=moveFormula(formula,name,op);if(next!==formula){f.textContent=next;affected.add(name);}for(const v of all(cell,'v'))v.remove();}
  }
  const doc=documents.get(op.sheet)!;
  const inheritIndex=Math.max(0,op.index-1),inheritRow=all(doc,'row').find(row=>Number(row.getAttribute('r'))===inheritIndex+1)?.cloneNode(true) as Element|undefined;
  const inheritCol=all(doc,'col').find(col=>Number(col.getAttribute('min'))<=inheritIndex+1&&Number(col.getAttribute('max'))>=inheritIndex+1)?.cloneNode(true) as Element|undefined;
  const inheritCells=new Map(all(doc,'row').map(row=>[Number(row.getAttribute('r')),Array.from(row.children).find(cell=>cell.localName==='c'&&XLSX.utils.decode_cell(cell.getAttribute('r')!).c===inheritIndex)?.getAttribute('s')]));
  for(const tag of ['tableParts','conditionalFormatting','dataValidations','legacyDrawing','extLst','oleObjects','controls','sheetProtection','scenarios','rowBreaks','colBreaks'])if(all(doc,tag).length)throw Error('此工作表含表格对象、条件格式、验证、保护、分页设置或特殊对象，暂不支持行列调整。');
  const dimension=all(doc,'dimension')[0],range=dimension?.getAttribute('ref'),extent=range?XLSX.utils.decode_range(range).e:{r:0,c:0};
  const limit=op.axis==='row'?Math.max(50000,extent.r+1):16384,axis=op.axis==='row'?'r':'c';
  if(op.index>=limit||op.kind==='insert'&&Math.max(op.index,extent[axis]+1)+op.count>limit||op.kind==='delete'&&op.index+op.count>limit)throw Error('调整后超出可编辑行列范围。');
  for(const row of all(doc,'row')){
    if(op.axis==='row'){const next=moveIndex(Number(row.getAttribute('r'))-1,op);if(next===null){row.remove();continue;}row.setAttribute('r',String(next+1));}
    row.removeAttribute('spans');
    for(const cell of Array.from(row.children).filter(node=>node.localName==='c')){const pos=XLSX.utils.decode_cell(cell.getAttribute('r')!),next=moveIndex(pos[axis],op);if(next===null)cell.remove();else {if(next>=(op.axis==='row'?1048576:16384))throw Error('调整后单元格超出 Excel 行列上限。');pos[axis]=next;cell.setAttribute('r',XLSX.utils.encode_cell(pos));}}
  }
  for(const merge of all(doc,'mergeCell')){const next=moveRange(merge.getAttribute('ref')!,op);if(!next||!next.includes(':'))merge.remove();else merge.setAttribute('ref',next);}
  for(const merges of all(doc,'mergeCells')){if(merges.children.length)merges.setAttribute('count',String(merges.children.length));else merges.remove();}
  if(op.axis==='column')for(const col of all(doc,'col')){const next=moveRange(XLSX.utils.encode_range({s:{r:0,c:Number(col.getAttribute('min'))-1},e:{r:0,c:Number(col.getAttribute('max'))-1}}),op);if(!next){col.remove();continue;}const range=XLSX.utils.decode_range(next);if(range.s.c>=16384){col.remove();continue;}col.setAttribute('min',String(range.s.c+1));col.setAttribute('max',String(Math.min(16384,range.e.c+1)));}
  if(op.kind==='insert'){
    const data=all(doc,'sheetData')[0];let count=0;
    if(op.axis==='row')for(let r=op.index;r<op.index+op.count;r++){
      const row=doc.createElementNS(MAIN,'row');if(inheritRow)for(const attr of Array.from(inheritRow.attributes))if(!['r','hidden','spans'].includes(attr.name))row.setAttribute(attr.name,attr.value);row.setAttribute('r',String(r+1));
      for(const prior of Array.from(inheritRow?.children||[]))if(prior.localName==='c'&&prior.hasAttribute('s')){if(++count>20000)throw Error('插入的样式继承超过 20000 格，请减少数量。');const cell=doc.createElementNS(MAIN,'c'),p=XLSX.utils.decode_cell(prior.getAttribute('r')!);cell.setAttribute('r',XLSX.utils.encode_cell({r,c:p.c}));cell.setAttribute('s',prior.getAttribute('s')!);row.append(cell);}data.insertBefore(row,Array.from(data.children).find(n=>Number(n.getAttribute('r'))>r+1)||null);
    }
    else{
      let cols=all(doc,'cols')[0];if(!cols){cols=doc.createElementNS(MAIN,'cols');doc.documentElement.insertBefore(cols,data);}for(const col of Array.from(cols.children)){const start=Number(col.getAttribute('min')),end=Number(col.getAttribute('max')),lo=op.index+1,hi=op.index+op.count;if(start>hi||end<lo)continue;col.remove();for(const [a,b] of [[start,Math.min(end,lo-1)],[Math.max(start,hi+1),end]])if(a<=b){const copy=col.cloneNode(true) as Element;copy.setAttribute('min',String(a));copy.setAttribute('max',String(b));cols.append(copy);}}
      const col=inheritCol||doc.createElementNS(MAIN,'col');col.removeAttribute('hidden');col.setAttribute('min',String(op.index+1));col.setAttribute('max',String(op.index+op.count));cols.append(col);const sorted=Array.from(cols.children).sort((a,b)=>Number(a.getAttribute('min'))-Number(b.getAttribute('min')));cols.replaceChildren(...sorted);
      for(const row of all(doc,'row')){const style=inheritCells.get(Number(row.getAttribute('r')));if(style==null)continue;for(let c=op.index;c<op.index+op.count;c++){if(++count>20000)throw Error('插入的样式继承超过 20000 格，请减少数量。');const cell=doc.createElementNS(MAIN,'c');cell.setAttribute('r',XLSX.utils.encode_cell({r:Number(row.getAttribute('r'))-1,c}));cell.setAttribute('s',style);row.insertBefore(cell,Array.from(row.children).find(n=>XLSX.utils.decode_cell(n.getAttribute('r')!).c>c)||null);}}
    }
  }
  for(const tag of ['dimension','autoFilter','sortState','sortCondition','hyperlink'])for(const element of all(doc,tag)){const ref=element.getAttribute('ref');if(ref){const next=moveRange(ref,op);if(next)element.setAttribute('ref',next);else if(tag==='dimension')element.setAttribute('ref','A1');else element.remove();}}
  if(dimension&&op.kind==='insert'){const bounds=XLSX.utils.decode_range(dimension.getAttribute('ref')||'A1');bounds.e[axis]=Math.max(bounds.e[axis],op.index+op.count-1);dimension.setAttribute('ref',XLSX.utils.encode_range(bounds));}
  for(const element of [...all(doc,'pane'),...all(doc,'selection')]){
    for(const attr of ['topLeftCell','activeCell','sqref']){const ref=element.getAttribute(attr);if(ref)element.setAttribute(attr,ref.split(' ').map(part=>moveRange(part,op)||'A1').join(' '));}
    if(element.localName==='pane'&&(element.getAttribute('state')||'').startsWith('frozen')){const split=op.axis==='row'?'ySplit':'xSplit',prior=Number(element.getAttribute(split)||0);if(prior){const next=moveIndex(prior,op);element.setAttribute(split,String(next??op.index));}}
  }
  // Ordinary image anchors follow the edited grid; image payloads remain untouched.
  const sheetRels=zip.file(targetPath.slice(0,targetPath.lastIndexOf('/')+1)+'_rels/'+targetPath.slice(targetPath.lastIndexOf('/')+1)+'.rels');
  if(all(doc,'drawing').length){if(!sheetRels)throw Error('图片关系缺失，不能安全调整。');const relations=xml(await sheetRels.async('string'));
    for(const drawing of all(doc,'drawing')){const relation=Array.from(relations.documentElement.children).find(node=>node.getAttribute('Id')===drawing.getAttributeNS(REL,'id'));if(!relation)throw Error('图片关系缺失。');const path=resolvePart(targetPath,relation.getAttribute('Target')!),entry=zip.file(path);if(!entry)throw Error('图片布局缺失。');const image=xml(await entry.async('string'));
      for(const anchor of Array.from(image.documentElement.children)){if(Array.from(anchor.getElementsByTagName('*')).some(node=>['graphicFrame','grpSp','sp','cxnSp'].includes(node.localName)))throw Error('复杂绘图不支持行列调整。');for(const marker of Array.from(anchor.children).filter(node=>['from','to'].includes(node.localName))){const value=Array.from(marker.children).find(node=>node.localName===(op.axis==='row'?'row':'col'));if(value)value.textContent=String(moveIndex(Number(value.textContent),op)??op.index);}}
      zip.file(path,new XMLSerializer().serializeToString(image));
    }
  }
  for(const [name,path] of paths)zip.file(path,new XMLSerializer().serializeToString(documents.get(name)!));
  let calc=all(work,'calcPr')[0];if(!calc){calc=work.createElementNS(MAIN,'calcPr');work.documentElement.append(calc);}calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');zip.file('xl/workbook.xml',new XMLSerializer().serializeToString(work));
  for(const relation of Array.from(rels.documentElement.children))if((relation.getAttribute('Type')||'').endsWith('/calcChain'))relation.remove();zip.file('xl/_rels/workbook.xml.rels',new XMLSerializer().serializeToString(rels));zip.remove('xl/calcChain.xml');
  const typesEntry=zip.file('[Content_Types].xml');if(typesEntry){const types=xml(await typesEntry.async('string'));for(const node of Array.from(types.documentElement.children))if(node.getAttribute('PartName')==='/xl/calcChain.xml')node.remove();zip.file('[Content_Types].xml',new XMLSerializer().serializeToString(types));}
  return {bytes:await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),affected:[...affected]};
}
