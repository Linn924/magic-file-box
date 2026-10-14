import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {readBasicWorkbook} from './loadWorkbook';
import {exportXlsCopy} from './xlsCopy';
import {hydrateXlsxStyles,styledXlsx} from './xlsStyles';
import {createFormulaCalculator} from './formula';
import type {ExcelChange,ExcelCopyFormat,ExcelValue} from '../../../shared/excelEditing';
import {hasActiveFilters} from './filterWorkbook';
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
function xml(text:string){const document=new DOMParser().parseFromString(text,'application/xml');if(document.querySelector('parsererror'))throw Error('源文件 XML 无法安全保存。');return document;}
function elements(node:Document|Element,name:string){return Array.from(node.getElementsByTagNameNS(MAIN,name));}
function applyValue(sheet:XLSX.WorkSheet,address:string,value:ExcelValue){
  const prior=sheet[address]||{};
  if(value.kind==='blank'){sheet[address]={...prior,t:'z',v:undefined};delete sheet[address].f;delete sheet[address].w;return;}
  sheet[address]={...prior,t:value.kind==='text'?'s':'n',v:value.kind==='formula'?undefined:value.value};delete sheet[address].w;delete sheet[address].f;
  if(value.kind==='formula')sheet[address].f=value.value;
  const cell=XLSX.utils.decode_cell(address),range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):{s:cell,e:cell};range.s.r=Math.min(range.s.r,cell.r);range.s.c=Math.min(range.s.c,cell.c);range.e.r=Math.max(range.e.r,cell.r);range.e.c=Math.max(range.e.c,cell.c);sheet['!ref']=XLSX.utils.encode_range(range);
}
export async function exportExcelCopy(bytes:Uint8Array,ext:string,changes:ExcelChange[],format:ExcelCopyFormat,currentSheet:string,refresh=false,rowScope:'all'|'visible'='all'){
  if(!changes.length&&format===ext&&!refresh&&rowScope==='all')return bytes.slice();
  const workbook=readBasicWorkbook(bytes,ext);
  for(const change of changes){const sheet=workbook.Sheets[change.sheet];if(!sheet)throw Error('工作表已不存在。');if(!change.alignmentOnly)applyValue(sheet,change.address,change.value);else if(change.alignment){sheet[change.address]??={t:"z"};const position=XLSX.utils.decode_cell(change.address),range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):{s:position,e:position};range.s.r=Math.min(range.s.r,position.r);range.s.c=Math.min(range.s.c,position.c);range.e.r=Math.max(range.e.r,position.r);range.e.c=Math.max(range.e.c,position.c);sheet['!ref']=XLSX.utils.encode_range(range);}}
  if(format==='xls'){
    if(ext==='xlsx'&&await hasActiveFilters(bytes))throw Error('XLS 无法完整保存本次筛选条件，请选择 XLSX；清除筛选后可另存 XLS。');
    if(ext==='xlsx')await hydrateXlsxStyles(bytes,workbook);
    return exportXlsCopy(workbook,changes);
  }
  if(format!=='xlsx'){
    if(changes.some(change=>change.sheet===currentSheet&&change.alignment))throw Error('CSV/TSV 不保存单元格对齐，请选择 XLSX 副本。');
    const sheet=workbook.Sheets[currentSheet];if(!sheet)throw Error('请选择工作表。');
    if(Object.keys(sheet).some(key=>!key.startsWith('!')&&!!sheet[key]?.f))throw Error('CSV/TSV 不保存未计算公式，请选择 XLSX 副本。');
    const separator=format==='csv'?',':'\t',range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):undefined,rows:string[]=[];
    if(range){if((range.e.r+1)*(range.e.c+1)>2000000)throw Error('当前工作表过大，建议另存 XLSX。');
      for(let r=0;r<=range.e.r;r++){if(rowScope==='visible'&&sheet['!rows']?.[r]?.hidden)continue;const cells:string[]=[];for(let c=0;c<=range.e.c;c++){
        const cell=sheet[XLSX.utils.encode_cell({r,c})];let text=cell?.v===undefined?'':String(cell.v);
        // Text that resembles a formula must stay text in spreadsheet consumers.
        if(cell?.t==='s'&&/^[=+\-@\t\r]/.test(text))text="'"+text;
        if(text.includes(separator)||/["\r\n]/.test(text))text='"'+text.replace(/"/g,'""')+'"';cells.push(text);
      }rows.push(cells.join(separator));}
    }
    return new TextEncoder().encode('\uFEFF'+rows.join('\r\n'));
  }
  const base=ext==='xlsx'?bytes:ext==='xls'?await styledXlsx(workbook):new Uint8Array(XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
  const zip=await JSZip.loadAsync(base),workbookEntry=zip.file('xl/workbook.xml'),relsEntry=zip.file('xl/_rels/workbook.xml.rels');
  const calculator=createFormulaCalculator(workbook);
  if(!workbookEntry||!relsEntry)throw Error('工作簿结构不完整。');
  const document=xml(await workbookEntry.async('string')),rels=xml(await relsEntry.async('string'));
  if(document.documentElement.namespaceURI!==MAIN)throw Error('首版不编辑严格格式的 XLSX，请先转换为常规 XLSX。');
  const paths=new Map<string,string>();
  let styleDocument:Document|undefined;let styleChanged=false;const styleIds=new Map<string,number>();
  async function alignedStyle(prior:string|null,alignment:string){
    if(!styleDocument){const entry=zip.file('xl/styles.xml');if(!entry)throw Error('缺少样式定义，无法保存对齐。');styleDocument=xml(await entry.async('string'));}
    const xfs=elements(styleDocument,'cellXfs')[0],base=Number(prior||0);if(!xfs||!xfs.children[base])throw Error('单元格样式定义无效。');
    const key=base+':'+alignment;if(styleIds.has(key))return styleIds.get(key)!;
    const xf=xfs.children[base].cloneNode(true) as Element;let node=elements(xf,'alignment')[0];if(!node){node=styleDocument.createElementNS(MAIN,'alignment');xf.insertBefore(node,Array.from(xf.children).find(child=>['protection','extLst'].includes(child.localName))||null);}node.setAttribute('horizontal',alignment);xf.setAttribute('applyAlignment','1');const id=xfs.children.length;xfs.append(xf);xfs.setAttribute('count',String(xfs.children.length));styleIds.set(key,id);styleChanged=true;return id;
  }
  for(const sheet of elements(document,'sheet')){
    const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const relation=Array.from(rels.documentElement.children).find(node=>node.getAttribute('Id')===id);
    const target=relation?.getAttribute('Target');if(!target||relation?.getAttribute('TargetMode')==='External')throw Error('不支持该工作表引用。');
    const parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),normalized:string[]=[];for(const part of parts){if(part==='..')normalized.pop();else if(part&&part!=='.')normalized.push(part);}paths.set(sheet.getAttribute('name')||'',normalized.join('/'));
  }
  for(const [name,path] of paths){
    const entry=zip.file(path);if(!entry)throw Error('缺少工作表。');const sheetDoc=xml(await entry.async('string')),data=elements(sheetDoc,'sheetData')[0];if(!data)throw Error('缺少单元格数据。');
    let changed=false;
    for(const change of changes.filter(change=>change.sheet===name)){
      const position=XLSX.utils.decode_cell(change.address);let row=elements(data,'row').find(row=>Number(row.getAttribute('r'))===position.r+1);
      if(!row){row=sheetDoc.createElementNS(MAIN,'row');row.setAttribute('r',String(position.r+1));const next=Array.from(data.children).find(node=>Number(node.getAttribute('r'))>position.r+1);data.insertBefore(row,next||null);}
      let cell=Array.from(row.children).find(cell=>cell.getAttribute('r')===change.address);
      if(!cell){cell=sheetDoc.createElementNS(MAIN,'c');cell.setAttribute('r',change.address);const next=Array.from(row.children).filter(node=>node.localName==='c').find(node=>XLSX.utils.decode_cell(node.getAttribute('r')||'A1').c>position.c);row.insertBefore(cell,next||Array.from(row.children).find(node=>node.localName!=='c')||null);}
      // Existing array/shared formula groups cannot be safely edited in this version.
      if(change.alignment){cell.setAttribute('s',String(await alignedStyle(cell.getAttribute('s'),change.alignment)));changed=true;}
      if(change.alignmentOnly||ext!=='xlsx')continue;
      const oldFormula=elements(cell,'f')[0];if(oldFormula?.hasAttribute('t')&&oldFormula.getAttribute('t')!=='normal')throw Error('此单元格属于共享/数组公式，首版不支持修改。');
      for(const node of Array.from(cell.children))if(['v','f','is'].includes(node.localName))node.remove();cell.removeAttribute('t');
      const value=change.value;
      if(value.kind==='text'){cell.setAttribute('t','inlineStr');const content=sheetDoc.createElementNS(MAIN,'is'),text=sheetDoc.createElementNS(MAIN,'t');text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');text.textContent=value.value;content.append(text);cell.append(content);}
      else if(value.kind==='number'){const v=sheetDoc.createElementNS(MAIN,'v');v.textContent=String(value.value);cell.append(v);}
      else if(value.kind==='formula'){const f=sheetDoc.createElementNS(MAIN,'f');f.textContent=value.value;cell.append(f);}
      changed=true;
    }
    // Dependencies may have changed; never leave a stale numeric formula cache.
    if(refresh||changes.some(change=>!change.alignmentOnly)||ext!=='xlsx')for(const cell of elements(sheetDoc,'c'))if(elements(cell,'f').length){
      for(const cache of elements(cell,'v'))cache.remove();cell.removeAttribute('t');const result=calculator.result(name,cell.getAttribute('r')!);
      if(result.error){if(['#NULL!','#REF!','#DIV/0!','#N/A','#VALUE!','#NAME?','#NUM!'].includes(result.error)){cell.setAttribute('t','e');const v=sheetDoc.createElementNS(MAIN,'v');v.textContent=result.error;cell.append(v);}}
      else {const v=sheetDoc.createElementNS(MAIN,'v');if(typeof result.value==='string')cell.setAttribute('t','str');else if(typeof result.value==='boolean')cell.setAttribute('t','b');v.textContent=typeof result.value==='boolean'?String(Number(result.value)):String(result.value??0);cell.append(v);}changed=true;
    }
    if(ext!=='xlsx')for(const cell of elements(sheetDoc,'c')){const alignment=workbook.Sheets[name][cell.getAttribute('r')!]?.s?.alignment?.horizontal;if(['left','center','right'].includes(alignment)){cell.setAttribute('s',String(await alignedStyle(cell.getAttribute('s'),alignment)));changed=true;}}
    if(changed){const dimension=elements(sheetDoc,'dimension')[0];if(dimension&&workbook.Sheets[name]?.['!ref'])dimension.setAttribute('ref',workbook.Sheets[name]['!ref']);zip.file(path,new XMLSerializer().serializeToString(sheetDoc));}
  }
  if(styleChanged)zip.file('xl/styles.xml',new XMLSerializer().serializeToString(styleDocument!));
  let calc=elements(document,'calcPr')[0];if(!calc){calc=document.createElementNS(MAIN,'calcPr');document.documentElement.append(calc);}calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
  zip.file('xl/workbook.xml',new XMLSerializer().serializeToString(document));
  for(const relation of Array.from(rels.documentElement.children))if((relation.getAttribute('Type')||'').endsWith('/calcChain'))relation.remove();
  zip.file('xl/_rels/workbook.xml.rels',new XMLSerializer().serializeToString(rels));zip.remove('xl/calcChain.xml');
  const typesEntry=zip.file('[Content_Types].xml');if(typesEntry){const types=xml(await typesEntry.async('string'));for(const node of Array.from(types.documentElement.children))if(node.getAttribute('PartName')==='/xl/calcChain.xml')node.remove();zip.file('[Content_Types].xml',new XMLSerializer().serializeToString(types));}
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
