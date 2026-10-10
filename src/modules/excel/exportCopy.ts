import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {readBasicWorkbook} from './loadWorkbook';
import type {ExcelChange,ExcelCopyFormat,ExcelValue} from '../../../shared/excelEditing';
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
export async function exportExcelCopy(bytes:Uint8Array,ext:string,changes:ExcelChange[],format:ExcelCopyFormat,currentSheet:string){
  if(!changes.length&&format===ext)return bytes.slice();
  const workbook=readBasicWorkbook(bytes,ext);
  for(const change of changes){const sheet=workbook.Sheets[change.sheet];if(!sheet)throw Error('工作表已不存在。');applyValue(sheet,change.address,change.value);}
  if(format!=='xlsx'){
    const sheet=workbook.Sheets[currentSheet];if(!sheet)throw Error('请选择工作表。');
    if(Object.keys(sheet).some(key=>!key.startsWith('!')&&!!sheet[key]?.f))throw Error('CSV/TSV 不保存未计算公式，请选择 XLSX 副本。');
    const separator=format==='csv'?',':'\t',range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):undefined,rows:string[]=[];
    if(range){if((range.e.r+1)*(range.e.c+1)>2000000)throw Error('当前工作表过大，建议另存 XLSX。');
      for(let r=0;r<=range.e.r;r++){const cells:string[]=[];for(let c=0;c<=range.e.c;c++){
        const cell=sheet[XLSX.utils.encode_cell({r,c})];let text=cell?.v===undefined?'':String(cell.v);
        // Text that resembles a formula must stay text in spreadsheet consumers.
        if(cell?.t==='s'&&/^[=+\-@\t\r]/.test(text))text="'"+text;
        if(text.includes(separator)||/["\r\n]/.test(text))text='"'+text.replace(/"/g,'""')+'"';cells.push(text);
      }rows.push(cells.join(separator));}
    }
    return new TextEncoder().encode('\uFEFF'+rows.join('\r\n'));
  }
  const base=ext==='xlsx'?bytes:new Uint8Array(XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
  const zip=await JSZip.loadAsync(base),workbookEntry=zip.file('xl/workbook.xml'),relsEntry=zip.file('xl/_rels/workbook.xml.rels');
  if(!workbookEntry||!relsEntry)throw Error('工作簿结构不完整。');
  const document=xml(await workbookEntry.async('string')),rels=xml(await relsEntry.async('string'));
  if(document.documentElement.namespaceURI!==MAIN)throw Error('首版不编辑严格格式的 XLSX，请先转换为常规 XLSX。');
  const paths=new Map<string,string>();
  for(const sheet of elements(document,'sheet')){
    const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const relation=Array.from(rels.documentElement.children).find(node=>node.getAttribute('Id')===id);
    const target=relation?.getAttribute('Target');if(!target||relation?.getAttribute('TargetMode')==='External')throw Error('不支持该工作表引用。');
    const parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),normalized:string[]=[];for(const part of parts){if(part==='..')normalized.pop();else if(part&&part!=='.')normalized.push(part);}paths.set(sheet.getAttribute('name')||'',normalized.join('/'));
  }
  for(const [name,path] of paths){
    const entry=zip.file(path);if(!entry)throw Error('缺少工作表。');const sheetDoc=xml(await entry.async('string')),data=elements(sheetDoc,'sheetData')[0];if(!data)throw Error('缺少单元格数据。');
    let changed=false;
    for(const change of ext==='xlsx'?changes.filter(change=>change.sheet===name):[]){
      const position=XLSX.utils.decode_cell(change.address);let row=elements(data,'row').find(row=>Number(row.getAttribute('r'))===position.r+1);
      if(!row){row=sheetDoc.createElementNS(MAIN,'row');row.setAttribute('r',String(position.r+1));const next=Array.from(data.children).find(node=>Number(node.getAttribute('r'))>position.r+1);data.insertBefore(row,next||null);}
      let cell=Array.from(row.children).find(cell=>cell.getAttribute('r')===change.address);
      if(!cell){cell=sheetDoc.createElementNS(MAIN,'c');cell.setAttribute('r',change.address);const next=Array.from(row.children).filter(node=>node.localName==='c').find(node=>XLSX.utils.decode_cell(node.getAttribute('r')||'A1').c>position.c);row.insertBefore(cell,next||Array.from(row.children).find(node=>node.localName!=='c')||null);}
      // Existing array/shared formula groups cannot be safely edited in this version.
      const oldFormula=elements(cell,'f')[0];if(oldFormula?.hasAttribute('t')&&oldFormula.getAttribute('t')!=='normal')throw Error('此单元格属于共享/数组公式，首版不支持修改。');
      for(const node of Array.from(cell.children))if(['v','f','is'].includes(node.localName))node.remove();cell.removeAttribute('t');
      const value=change.value;
      if(value.kind==='text'){cell.setAttribute('t','inlineStr');const content=sheetDoc.createElementNS(MAIN,'is'),text=sheetDoc.createElementNS(MAIN,'t');text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');text.textContent=value.value;content.append(text);cell.append(content);}
      else if(value.kind==='number'){const v=sheetDoc.createElementNS(MAIN,'v');v.textContent=String(value.value);cell.append(v);}
      else if(value.kind==='formula'){const f=sheetDoc.createElementNS(MAIN,'f');f.textContent=value.value;cell.append(f);}
      changed=true;
    }
    // Dependencies may have changed; never leave a stale numeric formula cache.
    for(const cell of elements(sheetDoc,'c'))if(elements(cell,'f').length){for(const cache of elements(cell,'v'))cache.remove();changed=true;}
    if(changed){const dimension=elements(sheetDoc,'dimension')[0];if(dimension&&workbook.Sheets[name]?.['!ref'])dimension.setAttribute('ref',workbook.Sheets[name]['!ref']);zip.file(path,new XMLSerializer().serializeToString(sheetDoc));}
  }
  let calc=elements(document,'calcPr')[0];if(!calc){calc=document.createElementNS(MAIN,'calcPr');document.documentElement.append(calc);}calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
  zip.file('xl/workbook.xml',new XMLSerializer().serializeToString(document));
  for(const relation of Array.from(rels.documentElement.children))if((relation.getAttribute('Type')||'').endsWith('/calcChain'))relation.remove();
  zip.file('xl/_rels/workbook.xml.rels',new XMLSerializer().serializeToString(rels));zip.remove('xl/calcChain.xml');
  const typesEntry=zip.file('[Content_Types].xml');if(typesEntry){const types=xml(await typesEntry.async('string'));for(const node of Array.from(types.documentElement.children))if(node.getAttribute('PartName')==='/xl/calcChain.xml')node.remove();zip.file('[Content_Types].xml',new XMLSerializer().serializeToString(types));}
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
