import {computed,ref,watch,toRaw,onBeforeUnmount,type Ref} from 'vue';
import * as XLSX from 'xlsx';
import type {PreviewFile} from '@shared/contracts';
import type {ExcelChange,ExcelValue,ExcelDraft,ExcelCopyFormat,ExcelTransaction,ExcelBefore,ExcelGridState,ExcelStructure,ExcelAlignment,ExcelSelection} from '@shared/excelEditing';
import {parseExcelInput,validateExcelText,parseTablePaste,excelInput,changeKey,changeSignature} from '../core/editing/editModel';
import {exportExcelCopy} from '../core/workbook/exportCopy';
import {changeStructure,moveIndex} from '../core/editing/structure';
import {createFormulaCalculator,formulaReferences,parseFormula} from '../core/formula/formula';
import {inspectXlsSave,type XlsWarning} from '../core/workbook/xlsCompatibility';
import {singleton,regionTargets} from '../core/editing/selection';
import {formatWorkbook} from '../core/workbook/formatWorkbook';
import type {FormatPatch} from '../core/editing/formatModel';
import {beginFileEdit} from '@/services/pendingEdits';
import {layoutWorkbook,mergeWorkbook,type LayoutChange} from '../core/workbook/layoutWorkbook';
import {captureRegion,pasteRegion as pasteWorkbook} from '../core/workbook/regionWorkbook';
import type {ExcelRegionClipboard,ExcelPasteMode} from '@shared/excelEditing';
import {contains} from '../core/editing/selection';
import {sheetWorkbook,type SheetOperation} from '../core/workbook/sheetWorkbook';
import {sortWorkbook} from '../core/workbook/sortWorkbook';
import {filterWorkbook,type FilterCondition} from '../core/workbook/filterWorkbook';
import type {SortKey} from '../core/editing/tableModel';
export function useEditor(file:PreviewFile,book:Ref<XLSX.WorkBook|undefined>,sheetName:Ref<string>,install:(bytes:Uint8Array,ext:string,widths?:Record<string,number>)=>Promise<void>,getWidths:()=>Record<string,number>,getNumFmt:(sheet:string,address:string)=>string|undefined=()=>undefined){
  const restored=file.view?.excelDraft;
  const editing=ref(restored?.editing??false),changes=ref<ExcelChange[]>(restored?.changes??[]),undoStack=ref<ExcelTransaction[]>(restored?.undo??[]),redoStack=ref<ExcelTransaction[]>(restored?.redo??[]);
  const savedSignature=ref(restored?.savedSignature??changeSignature([]));
  const baseBytes=ref<Uint8Array|undefined>(restored?.baseBytes),revisions=ref<Record<string,number>>(restored?.revisions??{});let serial=restored?.serial??0;
  const formatted=ref<string[]>(restored?.formatted??[]);
  const copyRows=ref<'all'|'visible'>('all');
  const busyEdit=ref(false);
  const address=ref(restored?.address||'A1'),selectedSheet=ref(restored?.sheet||''),input=ref(restored?.input??''),error=ref(''),status=ref(''),saving=ref(false),format=ref<ExcelCopyFormat>(file.ext==='xls'?'xls':file.ext==='csv'?'csv':file.ext==='tsv'?'tsv':'xlsx');
  const selection=ref<ExcelSelection>(restored?.selection??singleton(restored?.sheet||'',restored?.address||'A1'));
  const canEdit=computed(()=>!!book.value&&['xlsx','xls','csv','tsv'].includes(file.ext));
  const calculator=computed(()=>book.value?createFormulaCalculator(book.value,changes.value):undefined);
  const saveWarnings=ref<XlsWarning[]|undefined>();let resolveSave:((accept:boolean)=>void)|undefined;
  const confirmation=ref<{kind:'merge'|'overwrite';cells:Array<{address:string;text:string}>;count:number;selected:string}|undefined>();let resolveRange:((answer:string|false)=>void)|undefined;
  function answerRange(answer:string|false){confirmation.value=undefined;resolveRange?.(answer);resolveRange=undefined;}
  onBeforeUnmount(()=>answerRange(false));
  function confirmRange(kind:'merge'|'overwrite',cells:Array<{address:string;text:string}>){confirmation.value={kind,cells:cells.slice(0,200),count:cells.length,selected:cells[0]?.address||address.value};return new Promise<string|false>(resolve=>{resolveRange=resolve;});}
  function confirmCopy(accept:boolean){saveWarnings.value=undefined;resolveSave?.(accept);resolveSave=undefined;}
  onBeforeUnmount(()=>confirmCopy(false));
  function reviewCopy(warnings:XlsWarning[]){if(!warnings.length)return Promise.resolve(true);saveWarnings.value=warnings;return new Promise<boolean>(resolve=>{resolveSave=resolve;});}
  const patchMap=computed(()=>new Map(changes.value.filter(change=>!change.alignmentOnly).map(change=>[changeKey(change.sheet,change.address),change.value])));
  const alignmentMap=computed(()=>new Map(changes.value.filter(change=>change.alignment).map(change=>[changeKey(change.sheet,change.address),change.alignment!])));
  function original(sheet:string,cellAddress:string):ExcelValue {
    const cell=book.value?.Sheets[sheet]?.[cellAddress];if(!cell||cell.v===undefined&&!cell.f)return {kind:'blank'};
    if(cell.f)return {kind:'formula',value:cell.f};if(cell.t==='n')return {kind:'number',value:cell.v};return {kind:'text',value:String(cell.v??'')};
  }
  function valueAt(sheet:string,cellAddress:string){return patchMap.value.get(changeKey(sheet,cellAddress))??original(sheet,cellAddress);}
  function expectedInput(){return excelInput(valueAt(selectedSheet.value,address.value));}
  const pending=computed(()=>!!selectedSheet.value&&input.value!==expectedInput());
  function signature(values=changes.value,versions=revisions.value){return changeSignature([...values,...Object.entries(versions).map(([sheet,value])=>({sheet,address:'!structure',value:{kind:'number' as const,value}}))]);}
  const dirty=computed(()=>pending.value||busyEdit.value||signature()!==savedSignature.value);
  let ready=false;
  function persist(){
    if(!ready)return;
    file.view??={zoom:100,scroll:[]};
    const cloneGrid=(state:ExcelGridState):ExcelGridState=>({bytes:state.bytes,changes:JSON.parse(JSON.stringify(state.changes)),revisions:{...state.revisions},address:state.address,widths:state.widths?{...state.widths}:undefined,formatted:state.formatted?[...state.formatted]:undefined,selection:state.selection?JSON.parse(JSON.stringify(state.selection)):undefined});
    const cloneHistory=(entries:ExcelTransaction[])=>entries.map(entry=>({before:JSON.parse(JSON.stringify(entry.before)),after:JSON.parse(JSON.stringify(entry.after)),grid:entry.grid?{before:cloneGrid(entry.grid.before),after:cloneGrid(entry.grid.after)}:undefined}));
    const draft:ExcelDraft={editing:editing.value,changes:toRaw(changes.value).map(change=>({...toRaw(change),value:{...toRaw(change.value)}})),undo:cloneHistory(undoStack.value),redo:cloneHistory(redoStack.value),savedSignature:savedSignature.value,sheet:selectedSheet.value,address:address.value,input:input.value,baseBytes:baseBytes.value,revisions:{...revisions.value},serial,selection:JSON.parse(JSON.stringify(selection.value))};
    draft.formatted=[...formatted.value];file.view.excelDraft=draft;void window.localPreview.markModified(file.id,dirty.value).catch(()=>{});
  }
  watch([editing,changes,undoStack,redoStack,savedSignature,address,selectedSheet,input,revisions,busyEdit],persist,{deep:true,flush:'sync'});
  watch(selection,value=>{if(ready&&file.view?.excelDraft)file.view.excelDraft.selection=JSON.parse(JSON.stringify(value));},{deep:true,flush:'sync'});
  function refreshInput(){input.value=expectedInput();}
  function guardTarget(sheet:string,cellAddress:string){
    const worksheet=book.value?.Sheets[sheet];if(!worksheet)throw Error('请选择工作表。');const pos=XLSX.utils.decode_cell(cellAddress),base=worksheet['!ref']?XLSX.utils.decode_range(worksheet['!ref']):undefined;
    if(pos.r<0||pos.r>=Math.max(50000,(base?.e.r??0)+1)||pos.c<0||pos.c>=(file.ext==='xls'?256:16384))throw Error(file.ext==='xls'?'XLS 最多 65536 行、256 列。':'新增区域限 50000 行、16384 列。');
    for(const merge of worksheet['!merges']||[])if(pos.r>=merge.s.r&&pos.r<=merge.e.r&&pos.c>=merge.s.c&&pos.c<=merge.e.c&&(pos.r!==merge.s.r||pos.c!==merge.s.c))throw Error('请编辑合并单元格左上角；不支持粘贴到合并覆盖区域。');
    if(worksheet[cellAddress]?.F)throw Error('首版不支持修改数组公式区域。');
  }
  function setValues(updates:Array<ExcelChange|ExcelBefore>,record=true){
    const next=new Map(changes.value.map(change=>[changeKey(change.sheet,change.address),change]));
    for(const update of updates){const key=changeKey(update.sheet,update.address),same=JSON.stringify(update.value)===JSON.stringify(original(update.sheet,update.address));if(update.value===null||same&&!update.alignment)next.delete(key);else next.set(key,{sheet:update.sheet,address:update.address,value:update.value,alignment:update.alignment,alignmentOnly:same||undefined});}
    if(next.size>20000||[...next.values()].reduce((n,change)=>n+(change.value.kind==='blank'?0:String(change.value.value).length),0)>10000000)throw Error('当前草稿过大，请先另存并重新打开副本。');
    const priorMap=new Map(changes.value.map(change=>[changeKey(change.sheet,change.address),change]));
    const before=updates.map(update=>{const prior=priorMap.get(changeKey(update.sheet,update.address));return prior?{...prior}:{sheet:update.sheet,address:update.address,value:null};});changes.value=[...next.values()];
    if(record){undoStack.value.push({before,after:updates as ExcelChange[]});redoStack.value=[];trimHistory();}
  }
  function trimHistory(){while(undoStack.value.length>100||undoStack.value.reduce((n,entry)=>n+entry.after.length+(entry.grid?.before.changes.length??0),0)>20000||undoStack.value.reduce((n,entry)=>n+(entry.grid?.before.bytes?.length??0)+(entry.grid?.after.bytes?.length??0),0)>64*1024*1024||undoStack.value.reduce((n,entry)=>n+JSON.stringify([entry.before,entry.after,entry.grid?.before.changes,entry.grid?.after.changes]).length,0)>10000000)undoStack.value.shift();}
  function parseValue(text:string,cellAddress=address.value,sheet=selectedSheet.value,respectText=true){if(respectText&&getNumFmt(sheet,cellAddress)==='@'&&!text.startsWith("'")){validateExcelText(text);return text?{kind:'text' as const,value:text}:{kind:'blank' as const};}const value=parseExcelInput(text);if(file.ext==='xls'&&value.kind==='formula')for(const ref of formulaReferences(parseFormula(value.value)))for(const address of [ref.a,ref.b].filter(Boolean) as string[]){const pos=XLSX.utils.decode_cell(address.replace(/\$/g,''));if(pos.r>=65536||pos.c>=256)throw Error('XLS 公式引用不能超过 IV65536。');}return value;}
  function finishCell(){if(!pending.value)return true;try{guardTarget(selectedSheet.value,address.value);setValues([{sheet:selectedSheet.value,address:address.value,value:parseValue(input.value),alignment:alignmentMap.value.get(changeKey(selectedSheet.value,address.value))}]);error.value='';status.value='';refreshInput();return true;}catch(e){error.value=(e as Error).message;return false;}}
  function align(alignment:ExcelAlignment){if(!editing.value||saving.value||!finishCell())return;try{guardTarget(selectedSheet.value,address.value);setValues([{sheet:selectedSheet.value,address:address.value,value:valueAt(selectedSheet.value,address.value),alignment}]);error.value='';}catch(e){error.value=(e as Error).message;}}
  function select(cellAddress:string,sheet=sheetName.value){if(!editing.value)return true;if(!finishCell())return false;selectedSheet.value=sheet;address.value=cellAddress;selection.value=singleton(sheet,cellAddress);refreshInput();return true;}
  function toggle(){if(!canEdit.value)return;if(editing.value&&!finishCell())return;editing.value=!editing.value;selectedSheet.value=sheetName.value;if(selection.value.sheet!==sheetName.value)selection.value=singleton(sheetName.value,address.value);refreshInput();}
  async function restoreGrid(state:ExcelGridState){await install(state.bytes??file.bytes,state.bytes?'xlsx':file.ext,state.widths);baseBytes.value=state.bytes;formatted.value=[...(state.formatted??[])];changes.value=state.changes;revisions.value={...state.revisions};if(state.selection&&book.value?.Sheets[state.selection.sheet])sheetName.value=state.selection.sheet;selectedSheet.value=sheetName.value;address.value=state.address;selection.value=state.selection??singleton(sheetName.value,state.address);refreshInput();}
  async function undo(){if(saving.value)return;status.value='';error.value='';if(pending.value){refreshInput();return;}const entry=undoStack.value.at(-1);if(!entry)return;const end=beginFileEdit(file);busyEdit.value=true;saving.value=true;try{if(entry.grid)await restoreGrid(entry.grid.before);else setValues(entry.before,false);undoStack.value.pop();redoStack.value.push(entry);refreshInput();}catch(e){error.value=(e as Error).message;}finally{busyEdit.value=false;saving.value=false;persist();end();}}
  async function redo(){if(saving.value||pending.value)return;status.value='';error.value='';const entry=redoStack.value.at(-1);if(!entry)return;const end=beginFileEdit(file);busyEdit.value=true;saving.value=true;try{if(entry.grid)await restoreGrid(entry.grid.after);else setValues(entry.after,false);redoStack.value.pop();undoStack.value.push(entry);refreshInput();}catch(e){error.value=(e as Error).message;}finally{busyEdit.value=false;saving.value=false;persist();end();}}
  function paste(text:string){
    if(!editing.value||!finishCell())return;
    try{const start=XLSX.utils.decode_cell(address.value),rows=parseTablePaste(text),updates:ExcelChange[]=[];
      for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){const cellAddress=XLSX.utils.encode_cell({r:start.r+r,c:start.c+c});guardTarget(sheetName.value,cellAddress);updates.push({sheet:sheetName.value,address:cellAddress,value:parseValue(rows[r][c],cellAddress,sheetName.value),alignment:alignmentMap.value.get(changeKey(sheetName.value,cellAddress))});}
      setValues(updates);refreshInput();error.value='';status.value='已粘贴 '+updates.length+' 个单元格';
    }catch(e){error.value=(e as Error).message;}
  }
  async function discard(){if(saving.value||!await window.localPreview.confirmDiscard(file.id,true))return;const end=beginFileEdit(file);busyEdit.value=true;saving.value=true;try{if(baseBytes.value)await install(file.bytes,file.ext);baseBytes.value=undefined;formatted.value=[];revisions.value={};changes.value=[];undoStack.value=[];redoStack.value=[];savedSignature.value=changeSignature([]);error.value='';status.value='已恢复源文件内容';selectedSheet.value=sheetName.value;address.value='A1';selection.value=singleton(sheetName.value,'A1');refreshInput();}catch(e){error.value=(e as Error).message;}finally{busyEdit.value=false;saving.value=false;persist();end();}}
  async function structure(op:Omit<ExcelStructure,'sheet'>){
    if(file.ext==='xls'&&op.kind==='insert'){const current=book.value?.Sheets[sheetName.value]?.['!ref'],extent=current?XLSX.utils.decode_range(current).e:{r:0,c:0};if(Math.max(op.index,(op.axis==='row'?extent.r:extent.c)+1)+op.count>(op.axis==='row'?65536:256)){error.value='插入后超出 XLS 行列上限。';return false;}}
    if(!editing.value||saving.value||!finishCell())return false;const end=beginFileEdit(file);busyEdit.value=true;saving.value=true;error.value='';status.value='';
    try{const before:ExcelGridState={bytes:baseBytes.value,changes:[...changes.value],revisions:{...revisions.value},address:address.value,widths:{...getWidths()},formatted:[...formatted.value],selection:JSON.parse(JSON.stringify(selection.value))};
      const bytes=await exportExcelCopy(baseBytes.value??file.bytes,baseBytes.value?'xlsx':file.ext,changes.value,'xlsx',sheetName.value);
      const result=await changeStructure(bytes,{...op,sheet:sheetName.value});result.bytes=await exportExcelCopy(result.bytes,'xlsx',[],'xlsx',sheetName.value,true);if(result.bytes.length>100*1024*1024)throw Error('调整后工作簿超过 100 MB。');
      if((before.bytes?.length??0)+result.bytes.length>64*1024*1024)throw Error('此文件超出结构撤销的 64 MB 预算，请在表格软件中调整行列。');
      const versions={...revisions.value};for(const change of changes.value)versions[change.sheet]=++serial;for(const name of result.affected)versions[name]=++serial;
      const position=XLSX.utils.decode_cell(address.value),axis=op.axis==='row'?'r':'c';position[axis]=moveIndex(position[axis],{...op,sheet:sheetName.value})??op.index;
      const widthState:Record<string,number>={};for(const [key,width] of Object.entries(before.widths!)){if(op.axis==='column'&&key.startsWith(sheetName.value+':')){const column=moveIndex(Number(key.slice(key.lastIndexOf(':')+1)),{...op,sheet:sheetName.value});if(column!==null)widthState[sheetName.value+':'+column]=width;}else widthState[key]=width;}
      const after:ExcelGridState={bytes:result.bytes,changes:[],revisions:versions,address:XLSX.utils.encode_cell(position),widths:widthState,formatted:[...new Set([...formatted.value,...changes.value.filter(change=>change.alignment).map(change=>change.sheet)])]};
      after.selection=singleton(sheetName.value,after.address);await restoreGrid(after);undoStack.value.push({before:[],after:[],grid:{before,after}});redoStack.value=[];trimHistory();status.value=(op.kind==='insert'?'已插入 ':'已删除 ')+op.count+(op.axis==='row'?' 行':' 列');return true;
    }catch(e){error.value=(e as Error).message;return false;}finally{busyEdit.value=false;saving.value=false;persist();end();}
  }
  async function save(){
    if(['csv','tsv'].includes(format.value)&&formatted.value.includes(sheetName.value)){error.value='CSV/TSV 不保存单元格格式（字体、对齐等），请选择 Excel 副本。';return;}
    if(saving.value||!finishCell())return;const endSave=beginFileEdit(file);saving.value=true;error.value='';status.value='';
    const copyFormat=format.value,copySheet=sheetName.value;
    const snapshot=changes.value.map(change=>({...toRaw(change),value:{...toRaw(change.value)}})),saved=signature(snapshot);
    try{
      const current=baseBytes.value??file.bytes,ext=baseBytes.value?'xlsx':file.ext;
      const unchanged=!baseBytes.value&&!snapshot.length&&copyFormat===file.ext;
      if(file.ext==='xls'&&!unchanged&&['xls','xlsx'].includes(copyFormat)){
        const warnings=await inspectXlsSave(file.bytes,current,ext,copyFormat);
        if(!await reviewCopy(warnings)){status.value='已取消另存，草稿保留';return;}
      }
      const textCopy=['csv','tsv'].includes(copyFormat),scope=textCopy?copyRows.value:'all';
      const bytes=await exportExcelCopy(current,ext,snapshot,copyFormat,copySheet,false,scope);const result=await window.localPreview.saveExcelCopy(file.id,copyFormat,bytes);if(result==='saved'){if(scope==='all')savedSignature.value=['xlsx','xls'].includes(copyFormat)?saved:changeSignature([...(JSON.parse(savedSignature.value) as ExcelChange[]).filter(change=>change.sheet!==copySheet),...(JSON.parse(saved) as ExcelChange[]).filter(change=>change.sheet===copySheet)]);status.value=['xlsx','xls'].includes(copyFormat)?'已另存副本，源文件未改变':scope==='visible'?'仅可见行已另存，完整草稿仍保留':'当前工作表已另存，其余工作表不包含在此副本中';}else status.value='已取消另存';}
    catch(e){error.value=(e as Error).message;}finally{saving.value=false;persist();endSave();}
  }
  async function applyFormat(range:XLSX.Range,mode:string,patch:FormatPatch){
    if(!editing.value||saving.value||!finishCell())return false;const end=beginFileEdit(file);busyEdit.value=true;saving.value=true;error.value='';status.value='';
    try{regionTargets(range,[]);const before:ExcelGridState={bytes:baseBytes.value,changes:[...changes.value],revisions:{...revisions.value},address:address.value,widths:{...getWidths()},formatted:[...formatted.value],selection:JSON.parse(JSON.stringify(selection.value))};
      const source=await exportExcelCopy(before.bytes??file.bytes,before.bytes?'xlsx':file.ext,changes.value,'xlsx',sheetName.value),bytes=await formatWorkbook(source,sheetName.value,range,mode,patch,file.ext==='xls'?4000:64000);
      if(bytes.length>100*1024*1024||(before.bytes?.length??0)+bytes.length>64*1024*1024)throw Error('格式快照超过当前预算，请另存后重新打开。');const versions={...revisions.value};for(const change of changes.value)versions[change.sheet]=++serial;versions[sheetName.value]=++serial;
      const after:ExcelGridState={...before,bytes,changes:[],revisions:versions,formatted:[...new Set([...formatted.value,sheetName.value,...changes.value.filter(c=>c.alignment).map(c=>c.sheet)])]};await restoreGrid(after);undoStack.value.push({before:[],after:[],grid:{before,after}});redoStack.value=[];trimHistory();return true;
    }catch(e){error.value=(e as Error).message;return false;}finally{busyEdit.value=false;saving.value=false;persist();end();}
  }
  function initialize(){ready=true;if(selection.value.sheet!==sheetName.value)selection.value=singleton(sheetName.value,address.value);if(!selectedSheet.value||!book.value?.Sheets[selectedSheet.value]){selectedSheet.value=sheetName.value;refreshInput();}persist();}
  function occupied(range:XLSX.Range,exclude?:XLSX.Range){regionTargets(range,[]);const cells:Array<{address:string;text:string}>=[];for(const cellAddress of regionTargets(range,[])){if(exclude&&contains(exclude,cellAddress))continue;const value=valueAt(sheetName.value,cellAddress);if(value.kind!=='blank')cells.push({address:cellAddress,text:excelInput(value).slice(0,120)});}return cells;}
  async function mutateGrid(run:(bytes:Uint8Array)=>Promise<{bytes:Uint8Array;affected:string[];activeSheet?:string;renamed?:{from:string;to:string};removed?:string}|undefined>,range?:XLSX.Range,clearColumns?:LayoutChange,formatTouched=true,workbookTouched=false){
    if(!editing.value||saving.value||!finishCell())return false;const end=beginFileEdit(file);busyEdit.value=true;saving.value=true;error.value='';status.value='';
    try{const before:ExcelGridState={bytes:baseBytes.value,changes:[...changes.value],revisions:{...revisions.value},address:address.value,widths:{...getWidths()},formatted:[...formatted.value],selection:JSON.parse(JSON.stringify(selection.value))};const source=await exportExcelCopy(before.bytes??file.bytes,before.bytes?'xlsx':file.ext,changes.value,'xlsx',sheetName.value);const result=await run(source);if(!result){status.value='已取消，草稿保留';return false;}
      result.bytes=await exportExcelCopy(result.bytes,'xlsx',[],'xlsx',result.activeSheet??sheetName.value,true);
      if(result.bytes.length>100*1024*1024||(before.bytes?.length??0)+result.bytes.length>64*1024*1024)throw Error('编辑快照超过 64 MB 撤销预算，请另存后重新打开。');const versions={...revisions.value};for(const change of changes.value)versions[change.sheet]=++serial;for(const name of result.affected)versions[name]=++serial;
      if(workbookTouched)versions['!/workbook']=++serial;
      const rename=(name:string)=>name===result.renamed?.from?result.renamed.to:name;
      const widths={...before.widths};if(result.renamed)for(const key of Object.keys(widths))if(key.startsWith(result.renamed.from+':')){widths[result.renamed.to+key.slice(result.renamed.from.length)]=widths[key];delete widths[key];}if(clearColumns?.axis==='column'&&(clearColumns.size!==undefined||clearColumns.sizes))for(const key of Object.keys(widths)){const c=Number(key.slice(key.lastIndexOf(':')+1));if(key.startsWith(sheetName.value+':')&&c>=clearColumns.start&&c<=clearColumns.end)delete widths[key];}
      if(result.removed)for(const key of Object.keys(widths))if(key.startsWith(result.removed+':'))delete widths[key];
      const after:ExcelGridState={...before,bytes:result.bytes,changes:[],revisions:versions,widths,formatted:[...new Set([...formatted.value,...(formatTouched?result.affected:[]),...changes.value.filter(c=>c.alignment).map(c=>c.sheet)].filter(name=>name!==result.removed).map(rename))]};if(range){after.address=XLSX.utils.encode_cell(range.s);after.selection={sheet:sheetName.value,anchor:{...range.s},focus:{...range.e},mode:'cells'};}
      if(result.activeSheet){const same=result.activeSheet===sheetName.value||result.renamed?.from===sheetName.value;after.address=same?before.address:'A1';after.selection=same?{...before.selection!,sheet:result.activeSheet}:singleton(result.activeSheet,'A1');}
      await restoreGrid(after);undoStack.value.push({before:[],after:[],grid:{before,after}});redoStack.value=[];trimHistory();status.value='已完成，可撤销';return true;
    }catch(e){error.value=(e as Error).message;return false;}finally{busyEdit.value=false;saving.value=false;persist();end();}
  }
  function layout(op:LayoutChange){if(file.ext==='xls'&&!op.unhideAll&&op.end>=(op.axis==='row'?65536:256)){error.value='XLS 行列范围不能超过 IV65536。';return Promise.resolve(false);}return mutateGrid(bytes=>layoutWorkbook(bytes,sheetName.value,op),undefined,op);}
  async function merge(range:XLSX.Range,unmerge=false,center=false){return mutateGrid(async bytes=>{let keep=XLSX.utils.encode_cell(range.s);if(!unmerge){const values=occupied(range);if(values.length>1){const answer=await confirmRange('merge',values);if(answer===false)return;keep=answer;}else if(values.length)keep=values[0].address;}
    const result=await mergeWorkbook(bytes,sheetName.value,range,keep,unmerge);if(center&&!unmerge)result.bytes=await formatWorkbook(result.bytes,sheetName.value,range,'cells',{alignment:{horizontal:'center'}},file.ext==='xls'?4000:64000);return result;},range);}
  async function capture(range:XLSX.Range,text='',cut=false){if(!editing.value||saving.value||!finishCell())return;const end=beginFileEdit(file);saving.value=true;error.value='';status.value='';try{const bytes=await exportExcelCopy(baseBytes.value??file.bytes,baseBytes.value?'xlsx':file.ext,changes.value,'xlsx',sheetName.value);return await captureRegion(bytes,file.id,sheetName.value,range,text,signature(),cut,a=>{const r=calculator.value!.result(sheetName.value,a);return {value:r.value??undefined,error:r.error};});}catch(e){error.value=(e as Error).message;}finally{saving.value=false;end();}}
  async function copyRegion(range:XLSX.Range,text:string,cut=false){const data=await capture(range,text,cut);if(!data)return false;try{await window.localPreview.excelRegionClipboard(file.id,'copy',data);status.value=cut?'已剪切选区，粘贴成功后才移动':'已复制选区（内容、公式和格式）';return true;}catch(e){error.value=(e as Error).message;return false;}}
  async function pasteRich(clip:ExcelRegionClipboard,range:XLSX.Range,mode:ExcelPasteMode='all',series?:'row'|'column'){
    if(clip.cut&&(clip.file!==file.id||clip.signature!==signature())){error.value='剪切来源已改变或不在同一工作簿，请重新剪切。';return false;}
    const maxRows=file.ext==='xls'?65536:Math.max(50000,(book.value?.Sheets[sheetName.value]?.['!ref']?XLSX.utils.decode_range(book.value.Sheets[sheetName.value]['!ref']!).e.r:0)+1),maxCols=file.ext==='xls'?256:16384;
    const result=await mutateGrid(async bytes=>{if(mode!=='formats'){const values=occupied(range,clip.file===file.id&&clip.sheet===sheetName.value?clip.range:undefined);if(values.length&&await confirmRange('overwrite',values)===false)return;}return pasteWorkbook(bytes,sheetName.value,range,clip,mode,maxRows,maxCols,series);},range,undefined,mode==='all'||mode==='formats');
    if(result&&clip.cut)await window.localPreview.excelRegionClipboard(file.id,'clear');return result;
  }
  async function fill(source:XLSX.Range,target:XLSX.Range,direction:'row'|'column',series=false){const clip=await capture(source);if(!clip)return false;return pasteRich(clip,target,'all',series?direction:undefined);}
  function bulk(range:XLSX.Range,operation:'clear'|ExcelAlignment){if(!editing.value||saving.value||!finishCell())return false;try{const targets=regionTargets(range,book.value?.Sheets[sheetName.value]?.['!merges']||[]),updates:ExcelChange[]=[];for(const cellAddress of targets){guardTarget(sheetName.value,cellAddress);const value=operation==='clear'?{kind:'blank' as const}:valueAt(sheetName.value,cellAddress);if(operation==='clear'&&valueAt(sheetName.value,cellAddress).kind==='blank')continue;updates.push({sheet:sheetName.value,address:cellAddress,value,alignment:operation==='clear'?alignmentMap.value.get(changeKey(sheetName.value,cellAddress)):operation});}if(updates.length)setValues(updates);error.value='';refreshInput();return true;}catch(e){error.value=(e as Error).message;return false;}}
  function extent(sheet:string){let rows=0,cols=0;for(const change of changes.value)if(change.sheet===sheet){const cell=XLSX.utils.decode_cell(change.address);rows=Math.max(rows,cell.r+1);cols=Math.max(cols,cell.c+1);}return {rows,cols};}
  function replaceCells(sheet:string,items:Array<{address:string;text:string;literal:boolean;expected:ExcelValue}>){
    if(!editing.value||saving.value||!finishCell())return false;
    try{if(items.length>20000)throw Error('一次替换最多 20000 格。');const updates:ExcelChange[]=[];
      for(const item of items){guardTarget(sheet,item.address);if(JSON.stringify(valueAt(sheet,item.address))!==JSON.stringify(item.expected))throw Error('查找后内容已改变，请等待重新查找后再替换。');let value:ExcelValue;
        if(item.literal){validateExcelText(item.text);value=item.text?{kind:'text',value:item.text}:{kind:'blank'};}else value=parseValue(item.text,item.address,sheet,item.expected.kind!=='formula');
        if(JSON.stringify(value)!==JSON.stringify(item.expected))updates.push({sheet,address:item.address,value,alignment:alignmentMap.value.get(changeKey(sheet,item.address))});}
      if(updates.length)setValues(updates);refreshInput();error.value='';status.value=`已替换 ${updates.length} 格，可撤销`;return true;
    }catch(e){error.value=(e as Error).message;return false;}
  }
  function autoSum(range:XLSX.Range){
    if(!editing.value||saving.value||!finishCell())return false;
    try{regionTargets(range,[]);const targets:Array<{address:string;source:XLSX.Range}>=[];
      if(range.s.r===range.e.r&&range.s.c===range.e.c){const p=range.s;if(valueAt(sheetName.value,XLSX.utils.encode_cell(p)).kind!=='blank')throw Error('单格自动求和请选中空白结果格，或选择需要求和的区域。');let start=p.r-1;while(start>=0&&['number','formula'].includes(valueAt(sheetName.value,XLSX.utils.encode_cell({r:start,c:p.c})).kind)){if(p.r-start>20000)throw Error('自动求和来源最多 20000 格。');start--;}if(start<p.r-1)targets.push({address:XLSX.utils.encode_cell(p),source:{s:{r:start+1,c:p.c},e:{r:p.r-1,c:p.c}}});else {let left=p.c-1;while(left>=0&&['number','formula'].includes(valueAt(sheetName.value,XLSX.utils.encode_cell({r:p.r,c:left})).kind)){if(p.c-left>20000)throw Error('自动求和来源最多 20000 格。');left--;}if(left===p.c-1)throw Error('上方或左侧没有连续的数值区域，请先选择求和区域。');targets.push({address:XLSX.utils.encode_cell(p),source:{s:{r:p.r,c:left+1},e:{r:p.r,c:p.c-1}}});}}
      else if(range.s.r===range.e.r)targets.push({address:XLSX.utils.encode_cell({r:range.s.r,c:range.e.c+1}),source:range});
      else for(let c=range.s.c;c<=range.e.c;c++)targets.push({address:XLSX.utils.encode_cell({r:range.e.r+1,c}),source:{s:{r:range.s.r,c},e:{r:range.e.r,c}}});
      const updates:ExcelChange[]=targets.map(target=>{regionTargets(target.source,[]);guardTarget(sheetName.value,target.address);if(valueAt(sheetName.value,target.address).kind!=='blank')throw Error(`${target.address} 已有内容，请选择空白结果位置，自动求和不会覆盖它。`);if((book.value?.Sheets[sheetName.value]?.['!merges']||[]).some(m=>!(m.e.r<target.source.s.r||m.s.r>target.source.e.r||m.e.c<target.source.s.c||m.s.c>target.source.e.c)))throw Error('求和来源含合并区域，请先取消合并或手动输入公式。');return {sheet:sheetName.value,address:target.address,value:parseValue('=SUM('+XLSX.utils.encode_range(target.source)+')',target.address,sheetName.value,false),alignment:alignmentMap.value.get(changeKey(sheetName.value,target.address))};});
      setValues(updates);refreshInput();error.value='';status.value='已自动求和到 '+targets.map(t=>t.address).join('、');return true;
    }catch(e){error.value=(e as Error).message;return false;}
  }
  const manageSheet=(op:SheetOperation)=>mutateGrid(bytes=>sheetWorkbook(bytes,op,sheetName.value),undefined,undefined,false,true);
  const dataBytes=()=>exportExcelCopy(baseBytes.value??file.bytes,baseBytes.value?'xlsx':file.ext,changes.value,'xlsx',sheetName.value);
  const sortTable=(range:XLSX.Range,header:boolean,keys:SortKey[])=>mutateGrid(bytes=>sortWorkbook(bytes,sheetName.value,range,header,keys),range,undefined,false);
  const filterTable=(range:XLSX.Range,conditions:FilterCondition[],clear=false)=>mutateGrid(bytes=>filterWorkbook(bytes,sheetName.value,range,conditions,clear),range,undefined,false,true);
  const rowVisible=(r:number)=>!book.value?.Sheets[sheetName.value]?.['!rows']?.[r]?.hidden;
  return {dataBytes,sortTable,filterTable,copyRows,rowVisible,manageSheet,replaceCells,autoSum,numFmt:getNumFmt,confirmation,answerRange,layout,merge,capture,copyRegion,pasteRich,fill,selection,bulk,applyFormat,editing,changes,calculator,saveWarnings,confirmCopy,baseBytes,revisions,dirty,pending,selectedSheet,address,input,error,status,saving,format,canEdit,undoStack,redoStack,patchMap,alignmentMap,align,valueAt,select,toggle,finishCell,cancelInput:refreshInput,paste,undo,redo,discard,save,initialize,extent,structure};
}
