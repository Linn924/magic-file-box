import {NS,xml,elements,serialize,openGridBook} from './gridBook';
import {parseFormula,formulaReferences} from './formula';
import {cloneFilterMetadata} from './filterWorkbook';
export type SheetOperation = {kind:'create'|'copy'|'rename';sheet:string;name:string}|{kind:'delete'|'hide'|'show';sheet:string}|{kind:'move';sheet:string;index:number};
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG='http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES='http://schemas.openxmlformats.org/package/2006/content-types';
export function validateSheetName(name:string,names:string[],except?:string){
  if(!name.trim()||name.length>31||/[\x00-\x1f\x7f\\/?:*\[\]]/.test(name)||name.startsWith("'")||name.endsWith("'")||name.toLowerCase()==='history')throw Error('工作表名需为 1–31 字符，不能含 \\ / ? : * [ ]、控制字符或首尾单引号，也不能为 History。');
  if(names.some(n=>n!==except&&n.toLowerCase()===name.toLowerCase()))throw Error('工作表名称已存在（不区分大小写）。');
}
export function nextSheetName(names:string[],base='工作表'){
  for(let i=1;i<=10000;i++){const suffix=base==='工作表'?String(i):` (${i})`,name=base.slice(0,31-suffix.length)+suffix;if(!names.some(n=>n.toLowerCase()===name.toLowerCase()))return name;}
  throw Error('工作表名称过多。');
}
export function sheetFormula(formula:string,from:string,to?:string){
  let refs:ReturnType<typeof formulaReferences>;
  try{refs=formulaReferences(parseFormula(formula));}catch{throw Error('工作簿含无法安全调整的公式；请在表格软件中管理工作表。');}
  let result=formula;
  for(const ref of refs.reverse())if(ref.sheet?.toLowerCase()===from.toLowerCase()){
    const replacement=to===undefined?'#REF!':`'${to.replace(/'/g,"''")}'!${ref.a}${ref.b?':'+ref.b:''}`;
    result=result.slice(0,ref.start)+replacement+result.slice(ref.end);
  }
  return result;
}
function partPath(parent:string,target:string){const out:string[]=[];for(const item of (target.startsWith('/')?target.slice(1):parent.slice(0,parent.lastIndexOf('/')+1)+target).split('/')){if(item==='..'){if(!out.length)throw Error('工作簿关系路径越界。');out.pop();}else if(item&&item!=='.')out.push(item);}return out.join('/');}
function relPath(part:string){const at=part.lastIndexOf('/');return part.slice(0,at+1)+'_rels/'+part.slice(at+1)+'.rels';}
function relativePart(parent:string,target:string){const base=parent.split('/').slice(0,-1),dest=target.split('/');while(base.length&&dest.length&&base[0]===dest[0]){base.shift();dest.shift();}return '../'.repeat(base.length)+dest.join('/');}
/** Edit the original OOXML package; copying clones owned XML parts and shares immutable media. */
export async function sheetWorkbook(bytes:Uint8Array,op:SheetOperation,active:string){
  const grid=await openGridBook(bytes),{zip,work,sheets}=grid;
  if(elements(work,'workbookProtection').length)throw Error('工作簿结构受保护，不能管理工作表。');
  const nodes=elements(work,'sheet'),names=nodes.map(n=>n.getAttribute('name')!),target=nodes.find(n=>n.getAttribute('name')===op.sheet),container=elements(work,'sheets')[0];
  if(op.kind!=='create'&&!target)throw Error('工作表不存在。');
  if(['create','copy','rename'].includes(op.kind))validateSheetName((op as {name:string}).name,names,op.kind==='rename'?op.sheet:undefined);
  if(op.kind==='create'||op.kind==='copy')if(nodes.length>=256)throw Error('当前编辑最多 256 个工作表。');
  const visible=nodes.filter(n=>!n.hasAttribute('state')||n.getAttribute('state')==='visible');
  if(op.kind==='delete'&&nodes.length===1)throw Error('不能删除最后一个工作表。');
  if((op.kind==='hide'||op.kind==='delete')&&visible.includes(target!)&&visible.length===1)throw Error('必须保留至少一个可见工作表。');
  // Names/local sheet indices and complex linked objects cannot be rewritten safely yet.
  if(['rename','delete','copy'].includes(op.kind)&&(elements(work,'definedName').length||Object.keys(zip.files).some(p=>/^xl\/(externalLinks|charts|pivotTables|pivotCache|tables)\//.test(p))))throw Error('含命名区域、外部引用、图表、透视表或表格对象，不能安全执行此工作表操作。');
  if(op.kind==='move'&&elements(work,'definedName').length)throw Error('含局部命名区域，暂不支持调整工作表顺序。');
  const affected=new Set<string>(),relations=grid.rels,types=xml(await zip.file('[Content_Types].xml')!.async('string'));
  let nextActive=active;
  if(op.kind==='rename'||op.kind==='delete'){
    for(const [name,{doc}] of sheets){
      if(op.kind==='delete'&&name===op.sheet)continue;
      for(const cell of elements(doc,'c'))for(const f of elements(cell,'f')){
        if(f.hasAttribute('t')&&f.getAttribute('t')!=='normal')throw Error('共享、数组或数据表公式不支持工作表引用调整。');
        const prior=f.textContent||'',next=sheetFormula(prior,op.sheet,op.kind==='rename'?op.name:undefined);
        if(next!==prior){f.textContent=next;for(const v of elements(cell,'v'))v.remove();affected.add(name);}
      }
      // Internal hyperlink locations are sheet-qualified addresses, not executable URLs.
      for(const link of elements(doc,'hyperlink')){const loc=link.getAttribute('location');if(!loc)continue;let next:string;try{next=sheetFormula(loc,op.sheet,op.kind==='rename'?op.name:undefined);}catch{throw Error('工作表含无法安全调整的内部超链接。');}if(next!==loc){if(op.kind==='delete')link.remove();else link.setAttribute('location',next);affected.add(name);}}
      for(const tag of ['formula','formula1','formula2'])for(const f of elements(doc,tag)){const prior=f.textContent||'';if(!prior)continue;const next=sheetFormula(prior,op.sheet,op.kind==='rename'?op.name:undefined);if(next!==prior){f.textContent=next;affected.add(name);}}
    }
    if(op.kind==='rename'){
      target!.setAttribute('name',op.name);const entry=sheets.get(op.sheet)!;sheets.delete(op.sheet);sheets.set(op.name,entry);affected.delete(op.sheet);affected.add(op.name);if(active===op.sheet)nextActive=op.name;
    }else{
      const deleted=sheets.get(op.sheet)!.path;
      async function reachable(roots:string[]){const found=new Set<string>();async function visit(part:string){if(found.has(part))return;if(found.size>=4096)throw Error('工作表关联部件过多，不能安全删除。');found.add(part);const entry=zip.file(relPath(part));if(entry){const doc=xml(await entry.async('string'));for(const rel of Array.from(doc.documentElement.children))if(rel.getAttribute('TargetMode')!=='External')await visit(partPath(part,rel.getAttribute('Target')!));}}for(const root of roots)await visit(root);return found;}
      const owned=await reachable([deleted]),kept=await reachable([...sheets.entries()].filter(([name])=>name!==op.sheet).map(([,entry])=>entry.path));
      await cloneFilterMetadata(zip,deleted);target!.remove();sheets.delete(op.sheet);for(const part of owned)if(!kept.has(part)){zip.remove(part);zip.remove(relPath(part));for(const type of Array.from(types.documentElement.children))if(type.getAttribute('PartName')==='/'+part)type.remove();}
      for(const rel of Array.from(relations.documentElement.children))if(rel.getAttribute('Id')===target!.getAttributeNS(REL,'id'))rel.remove();
      for(const type of Array.from(types.documentElement.children))if(type.getAttribute('PartName')==='/'+deleted)type.remove();
      if(active===op.sheet)nextActive=visible.find(n=>n!==target)!.getAttribute('name')!;
    }
  }else if(op.kind==='create'||op.kind==='copy'){
    const allocate=(part:string)=>{const dot=part.lastIndexOf('.'),stem=part.slice(0,dot).replace(/\d+$/,''),ext=part.slice(dot);for(let i=1;i<=10000;i++){const path=`${stem}${i}${ext}`;if(!zip.files[path])return path;}throw Error('工作簿部件数量过多。');};
    const addType=(prior:string,next:string)=>{const existing=Array.from(types.documentElement.children).find(n=>n.getAttribute('PartName')==='/'+prior);if(existing){const copy=existing.cloneNode(true) as Element;copy.setAttribute('PartName','/'+next);types.documentElement.append(copy);}};
    const cloned=new Map<string,string>();let partCount=0;
    async function clonePart(prior:string):Promise<string>{
      if(cloned.has(prior))return cloned.get(prior)!;
      if(++partCount>256)throw Error('复制的关联部件超过 256 个。');
      const entry=zip.file(prior);if(!entry)throw Error('关联部件缺失，不能复制工作表。');
      const next=allocate(prior);cloned.set(prior,next);zip.file(next,await entry.async('uint8array'));addType(prior,next);
      const rels=zip.file(relPath(prior));if(rels){const doc=xml(await rels.async('string'));for(const rel of Array.from(doc.documentElement.children)){
        if(rel.getAttribute('TargetMode')==='External')continue;
        const type=rel.getAttribute('Type')||'';if(!['drawing','image','comments','vmlDrawing','hyperlink'].some(t=>type.endsWith('/'+t)))throw Error('此工作表包含暂不支持复制的关联对象。');
        const source=partPath(prior,rel.getAttribute('Target')!);
        const path=type.endsWith('/image')?source:await clonePart(source);if(!zip.file(path))throw Error('图片部件缺失。');rel.setAttribute('Target',relativePart(next,path));
      }zip.file(relPath(next),serialize(doc));}return next;
    }
    let path:string,doc:Document;
    if(op.kind==='copy'){
      const source=sheets.get(op.sheet)!;if(!elements(source.doc,'sheetData').length)throw Error('只能复制普通工作表。');
      for(const tag of ['tableParts','extLst','oleObjects','controls'])if(elements(source.doc,tag).length)throw Error('工作表含暂不支持复制的复杂对象。');
      path=await clonePart(source.path);await cloneFilterMetadata(zip,source.path,path);doc=xml(await zip.file(path)!.async('string'));
      // Reject unsupported formula syntax before publishing a copied sheet.
      for(const cell of elements(doc,'c'))for(const f of elements(cell,'f')){if(f.hasAttribute('t')&&f.getAttribute('t')!=='normal')throw Error('共享、数组或数据表公式暂不支持复制。');f.textContent=sheetFormula(f.textContent||'',op.sheet,op.name);for(const v of elements(cell,'v'))v.remove();}
      for(const link of elements(doc,'hyperlink')){const loc=link.getAttribute('location');if(loc)link.setAttribute('location',sheetFormula(loc,op.sheet,op.name));}
    }else{
      path=allocate('xl/worksheets/sheet.xml');doc=xml(`<worksheet xmlns="${NS}"><dimension ref="A1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><sheetData/></worksheet>`);
      const override=types.createElementNS(TYPES,'Override');override.setAttribute('PartName','/'+path);override.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');types.documentElement.append(override);zip.file(path,serialize(doc));
    }
    let number=Math.max(0,...nodes.map(n=>Number(n.getAttribute('sheetId'))))+1;while(Array.from(relations.documentElement.children).some(n=>n.getAttribute('Id')==='rIdSheet'+number))number++;const id='rIdSheet'+number;
    const rel=relations.createElementNS(PKG,'Relationship');rel.setAttribute('Id',id);rel.setAttribute('Type',REL+'/worksheet');rel.setAttribute('Target',relativePart('xl/workbook.xml',path));relations.documentElement.append(rel);
    const sheet=work.createElementNS(NS,'sheet');sheet.setAttribute('name',op.name);sheet.setAttribute('sheetId',String(Math.max(0,...nodes.map(n=>Number(n.getAttribute('sheetId'))))+1));sheet.setAttributeNS(REL,'r:id',id);container.insertBefore(sheet,op.kind==='copy'?target!.nextSibling:null);sheets.set(op.name,{path,doc});nextActive=op.name;affected.add(op.name);
  }else if(op.kind==='move'){
    if(!Number.isInteger(op.index)||op.index<0||op.index>=nodes.length)throw Error('工作表顺序无效。');
    const ordered=nodes.filter(n=>n!==target);ordered.splice(op.index,0,target!);container.replaceChildren(...ordered);
  }else{
    if(op.kind==='show')target!.removeAttribute('state');else {target!.setAttribute('state','hidden');if(active===op.sheet)nextActive=visible.find(n=>n!==target)!.getAttribute('name')!;}
  }
  const current=elements(work,'sheet'),index=current.findIndex(n=>n.getAttribute('name')===nextActive);
  for(const view of elements(work,'workbookView')){view.setAttribute('activeTab',String(Math.max(0,index)));view.setAttribute('firstSheet','0');}
  for(const [name,{doc}] of sheets)for(const view of elements(doc,'sheetView'))view.setAttribute('tabSelected',name===nextActive?'1':'0');
  // Sheet name/count/order metadata is optional; discard stale document property lists.
  zip.remove('docProps/app.xml');for(const type of Array.from(types.documentElement.children))if(type.getAttribute('PartName')==='/docProps/app.xml')type.remove();
  const rootRels=zip.file('_rels/.rels');if(rootRels){const doc=xml(await rootRels.async('string'));for(const rel of Array.from(doc.documentElement.children))if((rel.getAttribute('Type')||'').endsWith('/extended-properties'))rel.remove();zip.file('_rels/.rels',serialize(doc));}
  zip.file('xl/_rels/workbook.xml.rels',serialize(relations));zip.file('[Content_Types].xml',serialize(types));
  return {bytes:await grid.finish(),affected:[...affected],activeSheet:nextActive,renamed:op.kind==='rename'?{from:op.sheet,to:op.name}:undefined,removed:op.kind==='delete'?op.sheet:undefined};
}
