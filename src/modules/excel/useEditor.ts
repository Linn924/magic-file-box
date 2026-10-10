import {computed,ref,watch,toRaw,type Ref} from 'vue';
import * as XLSX from 'xlsx';
import type {PreviewFile} from '../../../shared/contracts';
import type {ExcelChange,ExcelValue,ExcelDraft,ExcelCopyFormat,ExcelTransaction,ExcelBefore} from '../../../shared/excelEditing';
import {parseExcelInput,parseTablePaste,excelInput,changeKey,changeSignature} from './editModel';
import {exportExcelCopy} from './exportCopy';
export function useEditor(file:PreviewFile,book:Ref<XLSX.WorkBook|undefined>,sheetName:Ref<string>){
  const restored=file.view?.excelDraft;
  const editing=ref(restored?.editing??false),changes=ref<ExcelChange[]>(restored?.changes??[]),undoStack=ref<ExcelTransaction[]>(restored?.undo??[]),redoStack=ref<ExcelTransaction[]>(restored?.redo??[]);
  const savedSignature=ref(restored?.savedSignature??changeSignature([]));
  const address=ref(restored?.address||'A1'),selectedSheet=ref(restored?.sheet||''),input=ref(restored?.input??''),error=ref(''),status=ref(''),saving=ref(false),format=ref<ExcelCopyFormat>(file.ext==='csv'?'csv':file.ext==='tsv'?'tsv':'xlsx');
  const canEdit=computed(()=>!!book.value&&['xlsx','csv','tsv'].includes(file.ext));
  const patchMap=computed(()=>new Map(changes.value.map(change=>[changeKey(change.sheet,change.address),change.value])));
  function original(sheet:string,cellAddress:string):ExcelValue {
    const cell=book.value?.Sheets[sheet]?.[cellAddress];if(!cell||cell.v===undefined&&!cell.f)return {kind:'blank'};
    if(cell.f)return {kind:'formula',value:cell.f};if(cell.t==='n')return {kind:'number',value:cell.v};return {kind:'text',value:String(cell.v??'')};
  }
  function valueAt(sheet:string,cellAddress:string){return patchMap.value.get(changeKey(sheet,cellAddress))??original(sheet,cellAddress);}
  function expectedInput(){return excelInput(valueAt(selectedSheet.value,address.value));}
  const pending=computed(()=>!!selectedSheet.value&&input.value!==expectedInput());
  const dirty=computed(()=>pending.value||changeSignature(changes.value)!==savedSignature.value);
  let ready=false;
  function persist(){
    if(!ready)return;
    file.view??={zoom:100,scroll:[]};
    const draft:ExcelDraft={editing:editing.value,changes:toRaw(changes.value).map(change=>({...toRaw(change),value:{...toRaw(change.value)}})),undo:JSON.parse(JSON.stringify(undoStack.value)),redo:JSON.parse(JSON.stringify(redoStack.value)),savedSignature:savedSignature.value,sheet:selectedSheet.value,address:address.value,input:input.value};
    file.view.excelDraft=draft;void window.localPreview.markModified(file.id,dirty.value).catch(()=>{});
  }
  watch([editing,changes,undoStack,redoStack,savedSignature,address,selectedSheet,input],persist,{deep:true,flush:'sync'});
  function refreshInput(){input.value=expectedInput();}
  function guardTarget(sheet:string,cellAddress:string){
    const worksheet=book.value?.Sheets[sheet];if(!worksheet)throw Error('请选择工作表。');const pos=XLSX.utils.decode_cell(cellAddress),base=worksheet['!ref']?XLSX.utils.decode_range(worksheet['!ref']):undefined;
    if(pos.r<0||pos.r>=Math.max(50000,(base?.e.r??0)+1)||pos.c<0||pos.c>=16384)throw Error('新增区域限 50000 行、16384 列。');
    for(const merge of worksheet['!merges']||[])if(pos.r>=merge.s.r&&pos.r<=merge.e.r&&pos.c>=merge.s.c&&pos.c<=merge.e.c&&(pos.r!==merge.s.r||pos.c!==merge.s.c))throw Error('请编辑合并单元格左上角；不支持粘贴到合并覆盖区域。');
    if(worksheet[cellAddress]?.F)throw Error('首版不支持修改数组公式区域。');
  }
  function setValues(updates:Array<ExcelChange|ExcelBefore>,record=true){
    const next=new Map(changes.value.map(change=>[changeKey(change.sheet,change.address),change]));
    for(const update of updates){const key=changeKey(update.sheet,update.address);if(update.value===null||JSON.stringify(update.value)===JSON.stringify(original(update.sheet,update.address)))next.delete(key);else next.set(key,{sheet:update.sheet,address:update.address,value:update.value});}
    if(next.size>20000||[...next.values()].reduce((n,change)=>n+(change.value.kind==='blank'?0:String(change.value.value).length),0)>10000000)throw Error('当前草稿过大，请先另存并重新打开副本。');
    const before=updates.map(update=>({...update,value:patchMap.value.get(changeKey(update.sheet,update.address))??null}));changes.value=[...next.values()];
    if(record){undoStack.value.push({before,after:updates as ExcelChange[]});redoStack.value=[];while(undoStack.value.length>100||undoStack.value.reduce((n,entry)=>n+entry.after.length,0)>20000||undoStack.value.reduce((n,entry)=>n+[...entry.before,...entry.after].reduce((sum,change)=>sum+(!change.value||change.value.kind==='blank'?0:String(change.value.value).length),0),0)>10000000)undoStack.value.shift();}
  }
  function finishCell(){if(!pending.value)return true;try{guardTarget(selectedSheet.value,address.value);setValues([{sheet:selectedSheet.value,address:address.value,value:parseExcelInput(input.value)}]);error.value='';status.value='';refreshInput();return true;}catch(e){error.value=(e as Error).message;return false;}}
  function select(cellAddress:string,sheet=sheetName.value){if(!editing.value)return true;if(!finishCell())return false;selectedSheet.value=sheet;address.value=cellAddress;refreshInput();return true;}
  function toggle(){if(!canEdit.value)return;if(editing.value&&!finishCell())return;editing.value=!editing.value;selectedSheet.value=sheetName.value;refreshInput();}
  function undo(){status.value='';error.value='';if(pending.value){refreshInput();error.value='';return;}const entry=undoStack.value.pop();if(!entry)return;setValues(entry.before,false);redoStack.value.push(entry);refreshInput();}
  function redo(){status.value='';error.value='';if(pending.value)return;const entry=redoStack.value.pop();if(!entry)return;setValues(entry.after,false);undoStack.value.push(entry);refreshInput();}
  function paste(text:string){
    if(!editing.value||!finishCell())return;
    try{const start=XLSX.utils.decode_cell(address.value),rows=parseTablePaste(text),updates:ExcelChange[]=[];
      for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){const cellAddress=XLSX.utils.encode_cell({r:start.r+r,c:start.c+c});guardTarget(sheetName.value,cellAddress);updates.push({sheet:sheetName.value,address:cellAddress,value:parseExcelInput(rows[r][c])});}
      setValues(updates);refreshInput();error.value='';status.value='已粘贴 '+updates.length+' 个单元格';
    }catch(e){error.value=(e as Error).message;}
  }
  async function discard(){if(!await window.localPreview.confirmDiscard(file.id,true))return;changes.value=[];undoStack.value=[];redoStack.value=[];savedSignature.value=changeSignature([]);error.value='';status.value='已恢复源文件内容';refreshInput();persist();}
  async function save(){
    if(saving.value||!finishCell())return;saving.value=true;error.value='';status.value='';
    const copyFormat=format.value,copySheet=sheetName.value;
    const snapshot=changes.value.map(change=>({...toRaw(change),value:{...toRaw(change.value)}})),signature=changeSignature(snapshot);
    try{const bytes=await exportExcelCopy(file.bytes,file.ext,snapshot,copyFormat,copySheet);const result=await window.localPreview.saveExcelCopy(file.id,copyFormat,bytes);if(result==='saved'){savedSignature.value=copyFormat==='xlsx'?signature:changeSignature([...(JSON.parse(savedSignature.value) as ExcelChange[]).filter(change=>change.sheet!==copySheet),...snapshot.filter(change=>change.sheet===copySheet)]);status.value=copyFormat==='xlsx'?'已另存副本，源文件未改变':'当前工作表已另存，其余工作表不包含在此副本中';}else status.value='已取消另存';}
    catch(e){error.value=(e as Error).message;}finally{saving.value=false;persist();}
  }
  function initialize(){ready=true;if(!selectedSheet.value||!book.value?.Sheets[selectedSheet.value]){selectedSheet.value=sheetName.value;refreshInput();}persist();}
  function extent(sheet:string){let rows=0,cols=0;for(const change of changes.value)if(change.sheet===sheet){const cell=XLSX.utils.decode_cell(change.address);rows=Math.max(rows,cell.r+1);cols=Math.max(cols,cell.c+1);}return {rows,cols};}
  return {editing,changes,dirty,pending,address,input,error,status,saving,format,canEdit,undoStack,redoStack,patchMap,valueAt,select,toggle,finishCell,cancelInput:refreshInput,paste,undo,redo,discard,save,initialize,extent};
}
