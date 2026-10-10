import {ref,nextTick,onBeforeUnmount,watch,type Ref} from 'vue';
import * as XLSX from 'xlsx';
import type {useEditor} from './useEditor';
import type {PreviewFile} from '../../../shared/contracts';
import {excelInput} from './editModel';
type Editor=ReturnType<typeof useEditor>;
export function useGridInteraction(file:PreviewFile,editor:Editor,rowCount:Ref<number>,colCount:Ref<number>,locate:(address:string)=>Promise<boolean>){
  const inline=ref(false),inlineInput=ref<HTMLTextAreaElement>(),menu=ref<{x:number;y:number;axis?:'row'|'column';index:number}|null>(null);
  const custom=ref(false),customAxis=ref<'row'|'column'>('row'),customSide=ref<'before'|'after'>('before'),customCount=ref(1);
  let tabDirection=1;
  function closeMenu(){menu.value=null;}
  function closeAll(){if(editor.saving.value)return;const wasCustom=custom.value;closeMenu();custom.value=false;if(wasCustom)void focusCell();}
  const onOutside=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.excel-context-menu,.excel-insert-dialog'))closeMenu();};
  window.addEventListener('pointerdown',onOutside);window.addEventListener('resize',closeAll);
  onBeforeUnmount(()=>{window.removeEventListener('pointerdown',onOutside);window.removeEventListener('resize',closeAll);});
  watch(editor.editing,value=>{if(!value){inline.value=false;closeAll();}});
  function cell(address:string){return document.querySelector<HTMLElement>(`[data-file-id="${file.id}"] .spreadsheet td[data-address="${address}"]`);}
  async function focusCell(){await nextTick();cell(editor.address.value)?.focus({preventScroll:true});}
  async function select(address:string,edit=false){if(editor.saving.value||!editor.editing.value)return;if(!editor.select(address))return;closeMenu();inline.value=edit;if(edit){await nextTick();inlineInput.value?.focus();inlineInput.value?.select();}}
  function commit(){if(!inline.value)return true;if(!editor.finishCell()){void nextTick(()=>inlineInput.value?.focus());return false;}inline.value=false;return true;}
  function cancel(){editor.cancelInput();inline.value=false;void focusCell();}
  async function move(dr:number,dc:number){if(!commit()||!editor.finishCell())return;const pos=XLSX.utils.decode_cell(editor.address.value);pos.r=Math.max(0,Math.min(rowCount.value-1,pos.r+dr));pos.c=Math.max(0,Math.min(colCount.value-1,pos.c+dc));
    // A merged block is one navigation stop; skip cells covered by its anchor.
    let address=XLSX.utils.encode_cell(pos);await locate(address);await nextTick();let target=cell(address);
    while(!target&&(dr||dc)&&pos.r>=0&&pos.r<rowCount.value&&pos.c>=0&&pos.c<colCount.value){pos.r+=dr;pos.c+=dc;if(pos.r<0||pos.r>=rowCount.value||pos.c<0||pos.c>=colCount.value)break;address=XLSX.utils.encode_cell(pos);await locate(address);await nextTick();target=cell(address);}
    if(target){await select(address);await focusCell();}
  }
  async function inlineKey(event:KeyboardEvent){
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}
    else if(event.key==='Enter'&&!event.altKey&&!event.shiftKey){event.preventDefault();event.stopPropagation();await move(1,0);}
    else if(event.key==='Tab'){event.preventDefault();event.stopPropagation();tabDirection=event.shiftKey?-1:1;await move(0,tabDirection);}
  }
  function inlineBlur(event:FocusEvent){if(editor.saving.value||!inline.value)return;const target=event.relatedTarget as HTMLElement|null;if(target?.closest('.excel-cell-input')){inline.value=false;return;}commit();}
  async function copy(){try{let text=excelInput(editor.valueAt(editor.selectedSheet.value,editor.address.value));if(/[\t\r\n"]/.test(text))text='"'+text.replace(/"/g,'""')+'"';await window.localPreview.excelClipboard(file.id,'copy',text);editor.error.value='';editor.status.value='已复制单元格';}catch(e){editor.error.value=(e as Error).message;}closeMenu();}
  async function paste(){if(!commit())return;closeMenu();try{editor.paste(await window.localPreview.excelClipboard(file.id,'paste'));}catch(e){editor.error.value=(e as Error).message;}await focusCell();}
  function clear(){if(!commit())return;editor.input.value='';editor.finishCell();closeMenu();void focusCell();}
  async function key(event:KeyboardEvent){if(!editor.editing.value||editor.saving.value||event.isComposing)return;
    if(event.key==='Escape'&&(menu.value||custom.value)){event.preventDefault();closeAll();return;}
    if(event.target instanceof Element&&event.target.closest('input,textarea,select,button'))return;
    if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();inline.value=false;await editor.undo();}
    else if(event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();inline.value=false;await editor.redo();}
    else if(event.ctrlKey&&event.key.toLowerCase()==='c'){event.preventDefault();await copy();}
    else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();clear();}
    else if(event.key==='F2'){event.preventDefault();await select(editor.address.value,true);}
    else if(['Enter','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const movements:Record<string,number[]>={Enter:[event.shiftKey?-1:1,0],Tab:[0,event.shiftKey?-1:1],ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};await move(movements[event.key][0],movements[event.key][1]);}
    else if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.length===1){event.preventDefault();await select(editor.address.value,true);editor.input.value=event.key;await nextTick();inlineInput.value?.setSelectionRange(1,1);}
  }
  async function context(event:MouseEvent,address:string,axis?:'row'|'column',index?:number){if(!editor.editing.value||editor.saving.value)return;event.preventDefault();if(!commit()||!editor.select(address))return;inline.value=false;
    const pos=XLSX.utils.decode_cell(address);menu.value={x:Math.max(4,Math.min(event.clientX,window.innerWidth-220)),y:Math.max(4,Math.min(event.clientY,window.innerHeight-340)),axis,index:index??(axis==='column'?pos.c:pos.r)};customAxis.value=axis??'row';customSide.value='before';customCount.value=1;
    await nextTick();document.querySelector<HTMLElement>(`[data-file-id="${file.id}"] .excel-context-menu button`)?.focus();
  }
  async function structure(axis:'row'|'column',kind:'insert'|'delete',side:'before'|'after',count=1){
    const pos=XLSX.utils.decode_cell(editor.address.value),index=(axis==='row'?pos.r:pos.c)+(kind==='insert'&&side==='after'?1:0);closeMenu();
    if(await editor.structure({axis,kind,index,count})){custom.value=false;await locate(editor.address.value);await focusCell();}
  }
  function openCustom(){editor.error.value='';custom.value=true;closeMenu();void nextTick(()=>document.querySelector<HTMLInputElement>(`[data-file-id="${file.id}"] .excel-insert-count`)?.focus());}
  function pasteEvent(event:ClipboardEvent){if(!editor.editing.value||editor.saving.value||event.target instanceof Element&&event.target.closest('textarea,input'))return;if(!event.clipboardData?.types.includes('text/plain'))return;event.preventDefault();editor.paste(event.clipboardData.getData('text/plain'));}
  return {inline,inlineInput,menu,custom,customAxis,customSide,customCount,select,commit,cancel,move,inlineKey,inlineBlur,key,context,copy,paste,clear,structure,openCustom,pasteEvent,closeAll};
}
