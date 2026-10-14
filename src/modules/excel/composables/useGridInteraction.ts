import {ref,computed,nextTick,onBeforeUnmount,watch,type Ref} from 'vue';
import * as XLSX from 'xlsx';
import type {useEditor} from './useEditor';
import type {PreviewFile} from '@shared/contracts';
import {excelInput} from '../core/editing/editModel';
import {selectionRange,contains,regionTargets} from '../core/editing/selection';
import type {ExcelPasteMode} from '@shared/excelEditing';
import {isoDate} from '../core/formula/dateSeries';
type Editor=ReturnType<typeof useEditor>;
export function useGridInteraction(file:PreviewFile,editor:Editor,rowCount:Ref<number>,colCount:Ref<number>,locate:(address:string)=>Promise<boolean>,scroll:Ref<HTMLElement|undefined>,onScroll:()=>void,merges:()=>XLSX.Range[],pageCols=100,display?:(address:string)=>string){
  const inline=ref(false),inlineInput=ref<HTMLTextAreaElement>(),menu=ref<{x:number;y:number;axis?:'row'|'column';index:number}|null>(null);
  const custom=ref(false),customAxis=ref<'row'|'column'>('row'),customSide=ref<'before'|'after'>('before'),customCount=ref(1);
  let tabDirection=1;
  const range=computed(()=>{try{return selectionRange(editor.selection.value,rowCount.value,colCount.value,merges());}catch(e){editor.error.value=(e as Error).message;const p=XLSX.utils.decode_cell(editor.address.value);return {s:p,e:p};}});
  const rangeLabel=computed(()=>XLSX.utils.encode_range(range.value));
  function selected(address:string){return editor.editing.value&&contains(range.value,address);}
  function choose(address:string,extend=false,mode:'cells'|'rows'|'columns'|'all'='cells'){
    if(!editor.editing.value||editor.saving.value||!commit()||!editor.finishCell())return false;
    const old=editor.selection.value,point=XLSX.utils.decode_cell(address),keep=extend&&old.sheet===editor.selectedSheet.value&&old.mode===mode;
    const merge=merges().find(m=>point.r>=m.s.r&&point.r<=m.e.r&&point.c>=m.s.c&&point.c<=m.e.c);
    if(!keep&&!editor.select(merge?XLSX.utils.encode_cell(merge.s):address))return false;
    editor.selection.value={sheet:editor.selectedSheet.value,anchor:keep?old.anchor:point,focus:point,mode};return true;
  }
  async function clickCell(address:string,event:MouseEvent){if(suppressClick&&event.detail)return;if(choose(address,event.shiftKey))await focusCell();}
  function header(axis:'row'|'column',index:number,event:MouseEvent){const p=XLSX.utils.decode_cell(editor.address.value);choose(XLSX.utils.encode_cell(axis==='row'?{r:index,c:p.c}:{r:p.r,c:index}),event.shiftKey,axis==='row'?'rows':'columns');void focusCell();}
  function all(){choose(editor.address.value,false,'all');void focusCell();}
  let drag:{id:number;x:number;y:number;startX:number;startY:number;moved:boolean;container:HTMLElement}|undefined,frame=0,suppressClick=false,paging=false,lastPaging=0;
  function endDrag(){if(!drag)return;const {container,id,moved}=drag;drag=undefined;cancelAnimationFrame(frame);frame=0;window.removeEventListener('pointermove',dragMove);window.removeEventListener('pointerup',endDrag);window.removeEventListener('pointercancel',endDrag);try{if(container.hasPointerCapture(id))container.releasePointerCapture(id);}catch{}suppressClick=moved;setTimeout(()=>{suppressClick=false;},0);}
  function pointCell(x:number,y:number){const container=scroll.value;if(!container)return;const bounds=container.getBoundingClientRect(),head=container.querySelector('thead')?.getBoundingClientRect(),gutter=container.querySelector('thead th')?.getBoundingClientRect();
    const element=document.elementFromPoint(Math.max((gutter?.right??bounds.left)+2,Math.min(bounds.right-16,x)),Math.max((head?.bottom??bounds.top)+2,Math.min(bounds.bottom-16,y)))?.closest<HTMLElement>('td[data-address]');
    if(element&&container.contains(element))return element.dataset.address;
  }
  function extendDrag(){if(!drag)return;const address=pointCell(drag.x,drag.y);if(address)editor.selection.value={...editor.selection.value,focus:XLSX.utils.decode_cell(address)};}
  function dragMove(event:PointerEvent){if(!drag||event.pointerId!==drag.id)return;drag.x=event.clientX;drag.y=event.clientY;if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>3){drag.moved=true;try{drag.container.setPointerCapture(drag.id);}catch{}}if(drag.moved)extendDrag();}
  function autoScroll(){if(!drag)return;if(!drag.container.clientWidth){endDrag();return;}const bounds=drag.container.getBoundingClientRect(),edge=28,dx=drag.x>bounds.right-edge?18:drag.x<bounds.left+edge?-18:0,dy=drag.y>bounds.bottom-edge?18:drag.y<bounds.top+edge?-18:0;
    if(drag.moved&&(dx||dy)){drag.container.scrollBy(dx,dy);onScroll();void nextTick(extendDrag);}frame=requestAnimationFrame(autoScroll);
    const focus=editor.selection.value.focus,atRight=drag.container.scrollLeft+drag.container.clientWidth>=drag.container.scrollWidth-2,atLeft=drag.container.scrollLeft<=2;
    if(drag.moved&&!paging&&Date.now()-lastPaging>350&&((dx>0&&atRight&&(focus.c+1)%pageCols===0&&focus.c+1<colCount.value)||(dx<0&&atLeft&&focus.c%pageCols===0&&focus.c>0))){paging=true;lastPaging=Date.now();const next={r:focus.r,c:focus.c+(dx>0?1:-1)};void locate(XLSX.utils.encode_cell(next)).then(()=>{if(drag)editor.selection.value={...editor.selection.value,focus:next};}).finally(()=>{paging=false;});}
  }
  function pointerDown(event:PointerEvent,address:string){if(event.button!==0||event.target instanceof Element&&event.target.closest('textarea,input'))return;if(!choose(address,event.shiftKey))return;const container=scroll.value;if(!container)return;endDrag();drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false,container};window.addEventListener('pointermove',dragMove);window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);frame=requestAnimationFrame(autoScroll);}
  let fillDrag:{id:number;source:XLSX.Range;selection:typeof editor.selection.value;x:number;y:number;direction:'row'|'column'}|undefined,fillFrame=0;
  function fillCorner(address:string){if(!editor.editing.value)return false;const p=XLSX.utils.decode_cell(address),merge=merges().find(m=>contains(m,address)),end=merge?.e||p;return end.r===range.value.e.r&&end.c===range.value.e.c;}
  function updateFill(){if(!fillDrag)return;const address=pointCell(fillDrag.x,fillDrag.y);if(!address)return;const p=XLSX.utils.decode_cell(address),source=fillDrag.source;fillDrag.direction=Math.max(0,p.r-source.e.r)>=Math.max(0,p.c-source.e.c)?'row':'column';const focus=fillDrag.direction==='row'?{r:Math.max(source.e.r,p.r),c:source.e.c}:{r:source.e.r,c:Math.max(source.e.c,p.c)};editor.selection.value={sheet:editor.selectedSheet.value,anchor:{...source.s},focus,mode:'cells'};}
  function fillMove(event:PointerEvent){if(!fillDrag||event.pointerId!==fillDrag.id)return;fillDrag.x=event.clientX;fillDrag.y=event.clientY;updateFill();}
  function fillScroll(){if(!fillDrag||!scroll.value)return;const bounds=scroll.value.getBoundingClientRect(),x=fillDrag.x>bounds.right-28?18:0,y=fillDrag.y>bounds.bottom-28?18:0;if(x||y){scroll.value.scrollBy(x,y);onScroll();void nextTick(updateFill);}fillFrame=requestAnimationFrame(fillScroll);}
  function finishFill(event?:PointerEvent){if(!fillDrag)return;const current=fillDrag,target=JSON.parse(JSON.stringify(range.value)) as XLSX.Range;fillDrag=undefined;cancelAnimationFrame(fillFrame);window.removeEventListener('pointermove',fillMove);window.removeEventListener('pointerup',finishFill);window.removeEventListener('pointercancel',finishFill);try{scroll.value?.releasePointerCapture(current.id);}catch{}editor.selection.value=current.selection;if(!event||event.type==='pointercancel'||target.e.r===current.source.e.r&&target.e.c===current.source.e.c)return;const length=current.direction==='row'?current.source.e.r-current.source.s.r+1:current.source.e.c-current.source.s.c+1;const single=XLSX.utils.encode_cell(current.source.s),series=length===2||length===1&&current.source.s.r===current.source.e.r&&current.source.s.c===current.source.e.c&&(XLSX.SSF.is_date(editor.numFmt(editor.selectedSheet.value,single)||'')||(()=>{const value=editor.valueAt(editor.selectedSheet.value,single);return value.kind==='text'&&!!isoDate(value.value)})());void editor.fill(current.source,target,current.direction,series);}
  function startFill(event:PointerEvent){if(event.button!==0||!commit()||!editor.finishCell()||editor.saving.value||!scroll.value)return;endDrag();fillDrag={id:event.pointerId,source:JSON.parse(JSON.stringify(range.value)),selection:JSON.parse(JSON.stringify(editor.selection.value)),x:event.clientX,y:event.clientY,direction:'row'};try{scroll.value.setPointerCapture(event.pointerId);}catch{}window.addEventListener('pointermove',fillMove);window.addEventListener('pointerup',finishFill);window.addEventListener('pointercancel',finishFill);fillFrame=requestAnimationFrame(fillScroll);}
  onBeforeUnmount(()=>finishFill());watch(editor.editing,()=>finishFill());
  onBeforeUnmount(endDrag);watch(editor.editing,value=>{if(!value)endDrag();});watch(editor.selectedSheet,endDrag);
  function closeMenu(){menu.value=null;}
  function closeAll(){if(editor.saving.value)return;const wasCustom=custom.value;closeMenu();custom.value=false;if(wasCustom)void focusCell();}
  const onOutside=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.excel-context-menu,.excel-insert-dialog'))closeMenu();};
  window.addEventListener('pointerdown',onOutside);window.addEventListener('resize',closeAll);
  onBeforeUnmount(()=>{window.removeEventListener('pointerdown',onOutside);window.removeEventListener('resize',closeAll);});
  watch(editor.editing,value=>{if(!value){inline.value=false;closeAll();}});
  function cell(address:string){return document.querySelector<HTMLElement>(`[data-file-id="${file.id}"] .spreadsheet td[data-address="${address}"]`);}
  async function focusCell(){await nextTick();const target=cell(editor.address.value)||scroll.value;target?.focus({preventScroll:true});}
  async function select(address:string,edit=false){if(editor.saving.value||!editor.editing.value)return;if(!editor.select(address))return;closeMenu();inline.value=edit;if(edit){await nextTick();inlineInput.value?.focus({preventScroll:true});inlineInput.value?.select();}}
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
  async function copy(cut=false){
    if(!commit()||!editor.finishCell())return;
    try{
      if(editor.copyRows.value==='visible'&&cut)throw Error('仅可见行只复制显示值；剪切请先选择全部行。');
      const allowed=new Set(regionTargets(range.value,merges())),rows:string[]=[];let size=0;
      for(let r=range.value.s.r;r<=range.value.e.r;r++){
        if(editor.copyRows.value==='visible'&&!editor.rowVisible(r))continue;
        const values:string[]=[];
        for(let c=range.value.s.c;c<=range.value.e.c;c++){
          const address=XLSX.utils.encode_cell({r,c});let text=allowed.has(address)?editor.copyRows.value==='visible'&&display?display(address):excelInput(editor.valueAt(editor.selectedSheet.value,address)):'';
          if(editor.copyRows.value==='visible'&&/^[=+\-@\t\r]/.test(text)){const original=editor.valueAt(editor.selectedSheet.value,address),literal=original.kind==='text'||original.kind==='formula'&&typeof editor.calculator.value?.result(editor.selectedSheet.value,address,false).value==='string';if(literal)text="'"+text;}
          if(/[\t\r\n"]/.test(text))text='"'+text.replace(/"/g,'""')+'"';
          size+=text.length+1;if(size>1000000)throw Error('复制内容最多 100 万字符。');values.push(text);
        }
        rows.push(values.join('\t'));
      }
      if(editor.copyRows.value==='visible'){await window.localPreview.excelRegionClipboard(file.id,'clear');await window.localPreview.excelClipboard(file.id,'copy',rows.join('\r\n'));editor.error.value='';editor.status.value='已复制可见行显示值（不含公式和格式）';}else await editor.copyRegion(range.value,rows.join('\r\n'),cut);
    }catch(e){editor.error.value=(e as Error).message;}
    closeMenu();
  }
  async function paste(mode:ExcelPasteMode='all'){if(!commit()||!editor.finishCell())return;closeMenu();try{const clip=await window.localPreview.excelRegionClipboard(file.id,'paste');if(!clip){if(mode==='formats')throw Error('请先在本工具内复制带格式的选区。');editor.paste(await window.localPreview.excelClipboard(file.id,'paste'));}else {const p=XLSX.utils.decode_cell(editor.address.value),height=clip.range.e.r-clip.range.s.r+1,width=clip.range.e.c-clip.range.s.c+1,chosen=range.value;const repeat=!clip.cut&&(chosen.e.r-chosen.s.r+1)%height===0&&(chosen.e.c-chosen.s.c+1)%width===0;const merged=height===1&&width===1&&merges().some(m=>m.s.r===p.r&&m.s.c===p.c&&m.e.r===chosen.e.r&&m.e.c===chosen.e.c);if(!clip.cut&&!repeat&&!merged&&(chosen.s.r!==chosen.e.r||chosen.s.c!==chosen.e.c))throw Error('目标选区尺寸须与复制区域匹配或为其整倍数。');const target=merged?{s:p,e:p}:repeat?chosen:{s:p,e:{r:p.r+height-1,c:p.c+width-1}};await editor.pasteRich(clip,target,mode);}}catch(e){editor.error.value=(e as Error).message;}await focusCell();}
  function clear(){if(!commit())return;editor.bulk(range.value,'clear');closeMenu();void focusCell();}
  async function key(event:KeyboardEvent){if(!editor.editing.value||editor.saving.value||event.isComposing)return;
    if(event.key==='Escape'&&fillDrag){event.preventDefault();finishFill();return;}
    if(event.key==='Escape'&&(menu.value||custom.value)){event.preventDefault();closeAll();return;}
    if(event.target instanceof Element&&event.target.closest('input,textarea,select,button'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();all();}
    else if(event.shiftKey&&event.key.startsWith('Arrow')){event.preventDefault();if(!commit()||!editor.finishCell())return;const p={...editor.selection.value.focus},merged=merges().find(m=>p.r>=m.s.r&&p.r<=m.e.r&&p.c>=m.s.c&&p.c<=m.e.c);if(event.key==='ArrowUp')p.r=merged?merged.s.r-1:p.r-1;if(event.key==='ArrowDown')p.r=merged?merged.e.r+1:p.r+1;if(event.key==='ArrowLeft')p.c=merged?merged.s.c-1:p.c-1;if(event.key==='ArrowRight')p.c=merged?merged.e.c+1:p.c+1;p.r=Math.max(0,Math.min(rowCount.value-1,p.r));p.c=Math.max(0,Math.min(colCount.value-1,p.c));editor.selection.value={...editor.selection.value,focus:p};await locate(XLSX.utils.encode_cell(p));await focusCell();}
    else if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();inline.value=false;await editor.undo();}
    else if(event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();inline.value=false;await editor.redo();}
    else if(event.ctrlKey&&event.key.toLowerCase()==='c'){event.preventDefault();await copy();}
    else if(event.ctrlKey&&event.key.toLowerCase()==='x'){event.preventDefault();await copy(true);}
    else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();clear();}
    else if(event.key==='F2'){event.preventDefault();await select(editor.address.value,true);}
    else if(['Enter','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const movements:Record<string,number[]>={Enter:[event.shiftKey?-1:1,0],Tab:[0,event.shiftKey?-1:1],ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};await move(movements[event.key][0],movements[event.key][1]);}
    else if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.length===1){event.preventDefault();await select(editor.address.value,true);editor.input.value=event.key;await nextTick();inlineInput.value?.setSelectionRange(1,1);}
  }
  async function context(event:MouseEvent,address:string,axis?:'row'|'column',index?:number){if(!editor.editing.value||editor.saving.value)return;event.preventDefault();if(!commit())return;if(axis)header(axis,index??0,event);else if(!selected(address)&&!editor.select(address))return;inline.value=false;
    const pos=XLSX.utils.decode_cell(address);menu.value={x:Math.max(4,Math.min(event.clientX,window.innerWidth-220)),y:Math.max(4,Math.min(event.clientY,window.innerHeight-440)),axis,index:index??(axis==='column'?pos.c:pos.r)};customAxis.value=axis??'row';customSide.value='before';customCount.value=1;
    await nextTick();const element=document.querySelector<HTMLElement>(`[data-file-id="${file.id}"] .excel-context-menu`);if(element&&menu.value){const rect=element.getBoundingClientRect();menu.value={...menu.value,x:Math.max(4,Math.min(menu.value.x,innerWidth-rect.width-4)),y:Math.max(4,Math.min(menu.value.y,innerHeight-rect.height-4))};element.querySelector<HTMLElement>('button')?.focus();}
  }
  async function structure(axis:'row'|'column',kind:'insert'|'delete',side:'before'|'after',count=1){
    const pos=XLSX.utils.decode_cell(editor.address.value),index=(axis==='row'?pos.r:pos.c)+(kind==='insert'&&side==='after'?1:0);closeMenu();
    if(await editor.structure({axis,kind,index,count})){custom.value=false;await locate(editor.address.value);await focusCell();}
  }
  function openCustom(){editor.error.value='';custom.value=true;closeMenu();void nextTick(()=>document.querySelector<HTMLInputElement>(`[data-file-id="${file.id}"] .excel-insert-count`)?.focus());}
  function align(value:'left'|'center'|'right'){if(!commit())return;editor.bulk(range.value,value);closeMenu();void focusCell();}
  function pasteEvent(event:ClipboardEvent){if(!editor.editing.value||editor.saving.value||event.target instanceof Element&&event.target.closest('textarea,input'))return;if(!event.clipboardData?.types.includes('text/plain'))return;event.preventDefault();if(event.clipboardData.getData('text/html').includes('file-preview-'))void paste();else editor.paste(event.clipboardData.getData('text/plain'));}
  return {startFill,fillCorner,range,rangeLabel,selected,choose,clickCell,header,all,pointerDown,inline,inlineInput,menu,custom,customAxis,customSide,customCount,select,commit,cancel,move,inlineKey,inlineBlur,key,context,copy,paste,clear,structure,openCustom,pasteEvent,closeAll,align};
}
