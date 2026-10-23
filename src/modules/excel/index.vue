<script setup lang="ts">
import PageNavigation from "@/components/preview/PageNavigation.vue";
import type { PreviewProps } from "@/modules/types";
import { usePreview } from "./composables/usePreview";
import {useGridInteraction} from './composables/useGridInteraction';
import ExcelToolButton from '@/components/ui/ToolButton.vue';
import ExcelIcon from '@/components/ui/ToolbarIcon.vue';
import FormulaPicker from './components/FormulaPicker.vue';
import XlsSaveReview from './components/XlsSaveReview.vue';
import FormatPanel from './components/FormatPanel.vue';
import AdvancedTools from './components/AdvancedTools.vue';
import FindPanel from './components/FindPanel.vue';
import FormulaAssist from './components/FormulaAssist.vue';
import SheetTools from './components/SheetTools.vue';
import SortFilterTools from './components/SortFilterTools.vue';
import {usePreviewNotice} from '@/composables/usePreviewNotice';
import {visibleSheetNames} from './core/editing/sheetState';
import {useFind} from './composables/useFind';
import {useFormulaAssist} from './composables/useFormulaAssist';
import {regionTargets} from './core/editing/selection';
import { ref,computed,watch,nextTick,onBeforeUnmount } from "vue";
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const {
  warning,editor,cellStyle,displayText,cellVisible,
  pane,
  scroll,
  onScroll,
  jump,
  locateCell,
  freezeFirstRow,
  freezeFirstCol,
  book,
  sheetName,
  rowPage,
  colPage,
  rows,
  columns,
  colWidth,
  fontStyle,
  images,
  rowCount,
  colCount,
  pageRows,
  pageCols,
  startCol,
  endCol,
  endRow,
  padTop,firstBodyRow,
  padBottom,
  resizeColumn,resizeRow,autoSize,
  XLSX,
} = usePreview(props, emit);
usePreviewNotice('excel-layout',warning);
const cellInput=ref<HTMLTextAreaElement>();
const advanced=ref<InstanceType<typeof AdvancedTools>>();
let restoreSaveFocus=false;
function answerCopy(accept:boolean){restoreSaveFocus=true;editor.confirmCopy(accept);}
watch(editor.saving,value=>{if(!value&&restoreSaveFocus){restoreSaveFocus=false;void nextTick(()=>pane.value?.querySelector<HTMLButtonElement>('.excel-save-copy')?.focus({preventScroll:true}));}});
const grid=useGridInteraction(props.file,editor,rowCount,colCount,address=>locateCell(address,true),scroll,onScroll,()=>book.value?.Sheets[sheetName.value]?.['!merges']||[],100,displayText);
const assist=useFormulaAssist(editor,sheetName,scroll,onScroll,()=>cellInput.value,colCount,address=>locateCell(address,true));
const find=useFind(editor,book,sheetName,()=>grid.range.value,()=>grid.commit()&&editor.finishCell(),async address=>{if(editor.editing.value)editor.select(address,sheetName.value);return locateCell(address,true);},displayText,cellVisible);
function findKey(event:KeyboardEvent){if(event.ctrlKey&&!event.altKey&&!event.isComposing&&event.key.toLowerCase()==='f'&&pane.value?.clientWidth){event.preventDefault();find.show();}}
window.addEventListener('keydown',findKey);onBeforeUnmount(()=>window.removeEventListener('keydown',findKey));
function confirmInput(){if(editor.finishCell())assist.finish();}
function cancelInput(){editor.cancelInput();assist.finish();grid.cancel();}
function saveCopy(){if(!grid.commit()||!editor.finishCell())return;assist.finish();void editor.save();}
function cellPointer(event:PointerEvent,address:string){if(!assist.pointer(event,address))grid.pointerDown(event,address);}
function cellClick(address:string,event:MouseEvent){if(!assist.click(event))void grid.clickCell(address,event);}
function inlineKey(event:KeyboardEvent){if(assist.key(event))return;if(event.key==='Escape'||event.key==='Enter'&&!event.altKey&&!event.shiftKey||event.key==='Tab')assist.finish();void grid.inlineKey(event);}
function inlineBlur(event:FocusEvent){if(assist.picking.value)return;assist.blur();grid.inlineBlur(event);}
function sheetPointer(event:PointerEvent,name:string){if(!assist.active())return;const start=assist.caret.value,end=assist.end.value;grid.inline.value=false;assist.sheetPick(event,name);void nextTick(()=>{cellInput.value?.focus({preventScroll:true});cellInput.value?.setSelectionRange(start,end);if(cellInput.value)assist.update({target:cellInput.value} as unknown as Event);});}
const formatStyles=()=>regionTargets(grid.range.value,book.value?.Sheets[sheetName.value]?.['!merges']||[]).map(address=>cellStyle(address));
const applyStyle=(patch:import('./core/editing/formatModel').FormatPatch)=>editor.applyFormat(grid.range.value,editor.selection.value.mode,patch);
const actionMenu=ref<'insert'|'delete'|'more'|null>(null);
const alignment=computed(()=>rows.value.flatMap(row=>row.cells).find(cell=>cell.address===editor.address.value)?.style.textAlign||'left');
function toggleActions(menu:'insert'|'delete'|'more'){if(!grid.commit()||!editor.finishCell())return;grid.closeAll();actionMenu.value=actionMenu.value===menu?null:menu;void nextTick(()=>pane.value?.querySelector<HTMLButtonElement>('.excel-actions-menu button')?.focus({preventScroll:true}));}
function closeActions(restoreFocus=false){const prior=actionMenu.value;actionMenu.value=null;if(restoreFocus&&prior)void nextTick(()=>pane.value?.querySelector<HTMLButtonElement>(`.excel-${prior}-toggle`)?.focus({preventScroll:true}));}
function outsideActions(event:PointerEvent){if(!(event.target instanceof Element)||!event.target.closest('.excel-actions,.excel-actions-menu'))closeActions();}
window.addEventListener('pointerdown',outsideActions);onBeforeUnmount(()=>window.removeEventListener('pointerdown',outsideActions));
function editorKey(event:KeyboardEvent){if(event.key==='Escape'&&actionMenu.value){event.preventDefault();closeActions(true);return;}void grid.key(event);}
async function actionStructure(axis:'row'|'column',kind:'insert'|'delete',side:'before'|'after'){closeActions();await grid.structure(axis,kind,side);}
function customInsert(){closeActions();grid.customAxis.value='row';grid.customSide.value='before';grid.customCount.value=1;grid.openCustom();}
function copyCell(){if(grid.commit()&&editor.finishCell())void grid.copy();}
watch(editor.editing,()=>closeActions());
watch(actionMenu,()=>{void nextTick(()=>{pane.value?.querySelectorAll<HTMLButtonElement>('.excel-actions-menu button').forEach(button=>{button.title ||= button.textContent?.trim()||'表格操作';button.setAttribute('aria-label',button.title);});});});
function resizeFormula(){void nextTick(()=>{const input=cellInput.value;if(input){input.style.height='28px';input.style.height=Math.min(88,Math.max(28,input.scrollHeight+2))+'px';}});}
watch([editor.input,editor.editing],resizeFormula,{immediate:true});
watch(sheetName,()=>{void nextTick(()=>{const nav=pane.value?.querySelector<HTMLElement>('.sheets'),tab=nav?.querySelector<HTMLElement>('.active');if(!nav||!tab||!nav.clientWidth)return;const bounds=nav.getBoundingClientRect(),rect=tab.getBoundingClientRect();if(rect.left<bounds.left)nav.scrollLeft-=bounds.left-rect.left;else if(rect.right>bounds.right)nav.scrollLeft+=rect.right-bounds.right;});});
function selectSheet(name:string){if(assist.active())return;if(!grid.commit()||!editor.finishCell())return;assist.finish();grid.closeAll();sheetName.value=name;rowPage.value=colPage.value=0;if(editor.editing.value)editor.select('A1',name);}
const visibleSheets=computed(()=>visibleSheetNames(book.value));
function prepareSheets(){if(!grid.commit()||!editor.finishCell())return false;assist.finish();grid.closeAll();closeActions();editor.error.value='';return true;}
function headerAddress(axis:'row'|'column',index:number){const current=XLSX.utils.decode_cell(editor.address.value);return XLSX.utils.encode_cell(axis==='row'?{r:index,c:current.c}:{r:current.r,c:index});}
function menuKey(event:KeyboardEvent){if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));let index=buttons.indexOf(document.activeElement as HTMLButtonElement);index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index]?.focus();}
function inputKey(event:KeyboardEvent){if(event.isComposing||assist.key(event))return;if(event.key==='Enter'&&!event.altKey&&!event.shiftKey){event.preventDefault();if(editor.finishCell())assist.finish();}else if(event.key==='Escape'){event.preventDefault();editor.cancelInput();assist.finish();cellInput.value?.blur();}}
function dialogTab(event:KeyboardEvent){const fields=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)'));const current=fields.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&current===0){event.preventDefault();fields.at(-1)?.focus();}else if(!event.shiftKey&&current===fields.length-1){event.preventDefault();fields[0]?.focus();}}
const locateRef = ref("");
const locateMsg = ref("");
async function locate() {
  if(editor.editing.value&&(!grid.commit()||!editor.finishCell()))return;
  const ok = await locateCell(locateRef.value);
  if(ok&&editor.editing.value){await grid.select(locateRef.value.toUpperCase());await grid.move(0,0);}
  locateMsg.value = ok ? '' : "无效单元格，例如 B12";
}
watch([editor.address,editor.selectedSheet],()=>{locateRef.value=editor.address.value;locateMsg.value='';},{immediate:true});
</script>
<template>
  <section ref="pane" class="excel" @keydown="editorKey">
    <Teleport :to="`[data-file-id='${props.file.id}'] .module-tools`" defer>
      <span class="excel-edit-tools">
        <ExcelToolButton class="excel-find-toggle" icon="search" title="查找与替换（Ctrl+F）" :pressed="find.open.value" :disabled="editor.saving.value" @click="find.show"/>
        <ExcelToolButton class="excel-edit-toggle" icon="edit" :pressed="editor.editing.value" :disabled="!editor.canEdit.value||editor.saving.value" :title="!editor.canEdit.value?'该格式暂不支持编辑':editor.editing.value?'结束编辑，切回预览（保留本次修改）':'编辑副本（源文件不变）'" @click="editor.toggle()" />
        <template v-if="!editor.editing.value"><ExcelToolButton class="excel-save-copy" icon="save" title="另存副本" :disabled="!editor.canEdit.value||editor.saving.value" @click="saveCopy" />
        <select v-model="editor.format.value" aria-label="副本格式" title="副本格式；CSV/TSV 只保存当前工作表" :disabled="!editor.canEdit.value||editor.saving.value"><option v-if="props.file.ext==='xls'" value="xls">XLS</option><option value="xlsx">XLSX</option><option value="csv">CSV</option><option value="tsv">TSV</option></select></template>
        <span class="excel-dirty" role="status">{{editor.dirty.value?'未保存':editor.changes.value.length||editor.baseBytes.value?'副本已保存':editor.editing.value?'编辑副本':'预览'}}</span>
      </span>
    </Teleport>
    <div v-if="editor.editing.value" class="excel-editor-toolbar" role="toolbar" aria-label="Excel 编辑工具栏">
      <span class="excel-command-group" data-group="save"><ExcelToolButton class="excel-save-copy" icon="save" title="另存副本（源文件不变）" :disabled="editor.saving.value" @click="editor.save()" /><select v-model="editor.format.value" aria-label="副本格式" title="副本格式；CSV/TSV 只保存当前工作表" :disabled="editor.saving.value"><option v-if="props.file.ext==='xls'" value="xls">XLS</option><option value="xlsx">XLSX</option><option value="csv">CSV</option><option value="tsv">TSV</option></select></span>
      <span class="excel-command-group" data-group="history"><ExcelToolButton class="excel-undo" icon="undo" title="撤销（表格内 Ctrl+Z）" :disabled="editor.saving.value||(!editor.pending.value&&!editor.undoStack.value.length)" @click="editor.undo()" /><ExcelToolButton class="excel-redo" icon="redo" title="重做（表格内 Ctrl+Y）" :disabled="editor.saving.value||editor.pending.value||!editor.redoStack.value.length" @click="editor.redo()" /></span>
      <span class="excel-command-group" data-group="clipboard"><ExcelToolButton class="excel-cut" icon="cut" title="剪切选区（Ctrl+X）" :disabled="editor.saving.value" @click="grid.copy(true)"/><ExcelToolButton icon="copy" title="复制选区（Ctrl+C）" :disabled="editor.saving.value" @click="copyCell" /><ExcelToolButton icon="paste" title="粘贴到选中单元格（Ctrl+V）" :disabled="editor.saving.value" @click="grid.paste()" /><ExcelToolButton class="excel-grid-command excel-paste-options" icon="expand" title="选择性粘贴" :disabled="editor.saving.value" @click="advanced?.openPaste($event)"/><ExcelToolButton icon="clear" title="清空选区（Delete）" :disabled="editor.saving.value" @click="grid.clear()" /></span>
      <span class="excel-command-group" data-group="format"><FormatPanel :disabled="editor.saving.value" :prepare="()=>grid.commit()&&editor.finishCell()" :styles="formatStyles" :apply="applyStyle" :message="editor.error.value" /><ExcelToolButton class="excel-brush" icon="brush" title="格式刷（选中来源后点击，再选择目标；再次点击取消）" :pressed="!!advanced?.brush" :disabled="editor.saving.value" @click="advanced?.paint()"/></span><span class="excel-command-group" data-group="alignment"><ExcelToolButton v-for="option in [{value:'left',label:'内容居左'},{value:'center',label:'内容居中'},{value:'right',label:'内容居右'}] as const" :key="option.value" :icon="option.value" :title="option.label" :pressed="alignment===option.value" :disabled="editor.saving.value" @click="grid.align(option.value)" /></span>
      <AdvancedTools ref="advanced" :editor="editor" :grid="grid" :file-id="file.id" :auto-size="autoSize" :row-size="r=>(book?.Sheets[sheetName]?.['!rows']?.[r]?.hpt||18)" :col-size="c=>(colWidth(c)-5)/7"/>
      <span class="excel-command-group" data-group="formula"><button class="tool-icon-button excel-auto-sum" title="自动求和（多行各列写入下方，单行写入右侧；空白单格识别上方或左侧）" aria-label="自动求和（多行各列写入下方，单行写入右侧；空白单格识别上方或左侧）" :disabled="editor.saving.value" @click="grid.commit()&&editor.autoSum(grid.range.value)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M13 3H4l5 5-5 5h9"/></svg></button></span>
      <SortFilterTools :file-id="file.id" :editor="editor" :sheet="sheetName" :book="book" :prepare="prepareSheets"/>
      <span class="excel-command-group" data-group="structure">
        <span class="excel-actions"><ExcelToolButton class="excel-insert-toggle" icon="insert" title="插入行或列" aria-haspopup="menu" :aria-expanded="actionMenu==='insert'" :disabled="editor.saving.value" @click="toggleActions('insert')" /><div v-if="actionMenu==='insert'" class="excel-actions-menu" role="menu" aria-label="插入行列" @keydown="menuKey"><button role="menuitem" @click="actionStructure('row','insert','before')"><ExcelIcon name="above" />上方插入行</button><button role="menuitem" @click="actionStructure('row','insert','after')"><ExcelIcon name="below" />下方插入行</button><button role="menuitem" @click="actionStructure('column','insert','before')"><ExcelIcon name="before" />左侧插入列</button><button role="menuitem" @click="actionStructure('column','insert','after')"><ExcelIcon name="after" />右侧插入列</button><hr /><button role="menuitem" class="excel-custom-insert" @click="customInsert"><ExcelIcon name="custom" />自定义插入…</button></div></span>
        <span class="excel-actions"><ExcelToolButton class="excel-delete-toggle" icon="delete" title="删除行或列" aria-haspopup="menu" :aria-expanded="actionMenu==='delete'" :disabled="editor.saving.value" @click="toggleActions('delete')" /><div v-if="actionMenu==='delete'" class="excel-actions-menu" role="menu" aria-label="删除行列" @keydown="menuKey"><button role="menuitem" @click="actionStructure('row','delete','before')"><ExcelIcon name="row" />删除当前行</button><button role="menuitem" @click="actionStructure('column','delete','before')"><ExcelIcon name="column" />删除当前列</button></div></span>
      </span>
      <span class="excel-command-group excel-actions" data-group="more"><ExcelToolButton class="excel-more-toggle" icon="more" title="更多表格操作" aria-haspopup="menu" :aria-expanded="actionMenu==='more'" :disabled="editor.saving.value" @click="toggleActions('more')" /><div v-if="actionMenu==='more'" class="excel-actions-menu" role="menu" aria-label="更多表格操作" @keydown="menuKey"><button role="menuitemcheckbox" :aria-checked="freezeFirstRow" @click="freezeFirstRow=!freezeFirstRow"><ExcelIcon name="row" />固定表头<span>{{freezeFirstRow?'✓':''}}</span></button><button role="menuitemcheckbox" :aria-checked="freezeFirstCol" @click="freezeFirstCol=!freezeFirstCol"><ExcelIcon name="column" />固定行号<span>{{freezeFirstCol?'✓':''}}</span></button><hr /><button class="excel-discard" role="menuitem" title="恢复最初打开的源内容（需确认）" @click="closeActions();editor.discard()"><ExcelIcon name="restore" />恢复源内容…</button></div></span>
    </div>
    <div v-if="editor.editing.value" class="excel-editor-bar">
      <input v-model="locateRef" class="cell-locate-input excel-name-box" :placeholder="editor.address.value" aria-label="定位单元格" :title="sheetName+'!'+editor.address.value+'；输入地址后回车定位'" :disabled="editor.saving.value" @keydown.enter.prevent="locate" />
      <ExcelToolButton class="excel-cancel-cell" icon="cancel" title="取消当前输入（Esc）" :disabled="editor.saving.value||!editor.pending.value" @click="cancelInput" />
      <ExcelToolButton class="excel-apply-cell" icon="check" title="确认当前输入（Enter）" :disabled="editor.saving.value||!editor.pending.value" @click="confirmInput" />
      <FormulaPicker :disabled="editor.saving.value" @insert="value=>{editor.input.value=value;nextTick(()=>cellInput?.focus({preventScroll:true}))}" />
      <textarea ref="cellInput" v-model="editor.input.value" class="excel-cell-input" aria-label="单元格内容" rows="1" :disabled="editor.saving.value" placeholder="输入内容或 =公式" @keydown="inputKey" @input="assist.update" @click="assist.update" @select="assist.update" @keyup="assist.update" @focus="assist.update" @blur="assist.blur"></textarea>
    </div>
    <FindPanel :find="find" :file-id="file.id" :editing="editor.editing.value" :disabled="editor.saving.value"/>
    <FormulaAssist :assist="assist"/>
    <p v-if="editor.error.value" class="excel-edit-error" role="alert">{{editor.error.value}}</p>
    <span v-if="editor.status.value" class="excel-edit-status sr-only" role="status">{{editor.status.value}}</span>
    <XlsSaveReview v-if="editor.saveWarnings.value" :warnings="editor.saveWarnings.value" :format="editor.format.value" @answer="answerCopy" />
    <div v-show="!editor.editing.value" class="sheet-tools" role="toolbar" aria-label="表格定位与冻结">
      <label class="cell-locate"
        >定位<input
          v-model="locateRef"
          class="cell-locate-input"
          placeholder="如 B12"
          aria-label="定位单元格"
          @keydown.enter.prevent="locate"
        />
        <ExcelToolButton icon="jump" title="定位单元格（地址框内 Enter）" @click="locate" />
        </label
      >
      <label class="freeze-toggle"
        ><input v-model="freezeFirstRow" type="checkbox" /> 首行</label
      ><label class="freeze-toggle"
        ><input v-model="freezeFirstCol" type="checkbox" /> 首列</label
      >
      <small v-if="locateMsg" class="locate-status" role="status">{{ locateMsg }}</small>
    </div>
    <p v-if="editor.editing.value&&locateMsg" class="excel-edit-error" role="alert">{{locateMsg}}</p>
    <div ref="scroll" class="table-wrap" :tabindex="editor.editing.value?0:undefined" @scroll.passive="onScroll" @paste="grid.pasteEvent">
      <div
        v-if="rows.length"
        class="sheet-surface"
        :class="{
          'freeze-row': freezeFirstRow,
          'freeze-col': freezeFirstCol,
        }"
        :style="{
          zoom: zoom / 100,
        }"
      >
        <table class="spreadsheet preview-content">
          <colgroup>
            <col style="width: 46px" />
            <col
              v-for="c in columns"
              :key="c"
              :style="{ width: colWidth(c) + 'px' }"
            />
          </colgroup>
          <thead>
            <tr>
              <th title="全选（编辑模式 Ctrl+A）" aria-label="全选" @click="grid.all"></th>
              <th v-for="c in columns" :key="c" :data-column="c" @click="grid.header('column',c,$event)" @contextmenu="grid.context($event,headerAddress('column',c),'column',c)">
                {{ XLSX.utils.encode_col(c)
                }}<span
                  class="column-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  title="拖动调整列宽"
                  @pointerdown="resizeColumn($event, c)"
                  @dblclick.stop="editor.editing.value&&autoSize('column',c,c)"
                ></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.r">
            <tr v-if="row.r===firstBodyRow && padTop>0" class="row-virtual-spacer" aria-hidden="true" :style="{height:padTop+'px'}"><td :colspan="columns.length+1"></td></tr>
            <tr
              :data-row="row.r"
              :style="{
                height: row.height + 'px',
              }"
            >
              <th @click="grid.header('row',row.r,$event)" @contextmenu="grid.context($event,headerAddress('row',row.r),'row',row.r)">{{ row.r + 1 }}<span v-if="editor.editing.value" class="row-resize-handle" role="separator" aria-orientation="horizontal" title="拖动调整行高，双击自动适应" @pointerdown="resizeRow($event,row.r)" @dblclick.stop="autoSize('row',row.r,row.r)"></span></th>
              <td
                v-for="cell in row.cells"
                :key="cell.c"
                :data-address="cell.address"
                :tabindex="editor.editing.value?0:undefined"
                :class="{'excel-range-cell':grid.selected(cell.address),'excel-selected-cell':editor.editing.value&&editor.selectedSheet.value===sheetName&&editor.address.value===cell.address,'excel-changed-cell':cell.modified,'excel-find-hit':find.marked(cell.address),'excel-formula-reference':assist.marked(cell.address)}"
                @pointerdown="cellPointer($event,cell.address)" @click="cellClick(cell.address,$event)"
                @dblclick="!assist.active()&&grid.select(cell.address,true)"
                @contextmenu="grid.context($event,cell.address)"
                :style="cell.style"
                :rowspan="cell.rowspan"
                :colspan="cell.colspan"
                :title="cell.title"
              >
                <textarea v-if="grid.inline.value&&editor.address.value===cell.address" :ref="(el:any)=>{grid.inlineInput.value=el;}" v-model="editor.input.value" class="excel-inline-input" aria-label="单元格内编辑" :disabled="editor.saving.value" @click.stop="assist.update" @dblclick.stop @keydown.stop="inlineKey" @input="assist.update" @select="assist.update" @keyup="assist.update" @focus="assist.update" @blur="inlineBlur"></textarea>
                <span v-else class="excel-text-box" :class="{'excel-text-rotated':!!cell.rotation}" :data-angle="cell.rotation" :style="{...(cell.rotation?{height:cell.rotationHeight+'px'}:{}),...(cell.clipHeight!==undefined?{maxHeight:cell.clipHeight+'px',overflow:'hidden'}:{})}"><span :style="cell.rotation?{display:'inline-block',transform:'rotate('+(-cell.rotation)+'deg)',whiteSpace:'pre'}:undefined"><template v-if="cell.rich"><span v-for="(run,i) in cell.rich" :key="i" :style="fontStyle(run.font)">{{run.text}}</span></template><template v-else>{{cell.text}}</template></span></span>
                <span v-if="editor.editing.value&&!editor.saving.value&&grid.fillCorner(cell.address)" class="excel-fill-handle" title="拖动填充（两格数字按差值，单格日期逐日）" @pointerdown.stop.prevent="grid.startFill($event)"></span>
              </td>
            </tr>
            </template>
            <tr
              v-if="padBottom > 0"
              class="row-virtual-spacer"
              aria-hidden="true"
              :style="{ height: padBottom + 'px' }"
            >
              <td :colspan="columns.length + 1"></td>
            </tr>
          </tbody>
        </table>
        <img
          v-for="(img, i) in images"
          :key="img.id + ':' + i"
          class="sheet-image"
          :src="img.url"
          :style="img.style"
          alt="表格内嵌图片"
        />
      </div>
      <p v-else class="empty">此工作表没有数据</p>
    </div>
    <footer class="sheet-footer">
      <span v-if="editor.editing.value" class="excel-selection-summary" aria-live="polite">{{grid.rangeLabel.value}}</span><nav class="sheets" aria-label="工作表"><button v-for="name in visibleSheets" :key="name" :class="{active:name===sheetName}" :title="name" :disabled="editor.saving.value" @pointerdown="sheetPointer($event,name)" @click="selectSheet(name)">{{name}}</button></nav>
      <SheetTools v-if="editor.editing.value" :file-id="file.id" :book="book" :sheet="sheetName" :disabled="editor.saving.value" :prepare="prepareSheets" :apply="editor.manageSheet" :message="editor.error.value"/>
      <span
        >{{ rowCount.toLocaleString() }} 行 ·
        {{ colCount.toLocaleString() }} 列</span
      >
      <div v-if="colCount > pageCols">
        <button :disabled="colPage === 0" @click="colPage--">
          前 {{ pageCols }} 列</button
        ><span>{{ startCol + 1 }}–{{ endCol }} 列</span
        ><button :disabled="endCol >= colCount" @click="colPage++">
          后 {{ pageCols }} 列
        </button>
      </div>
    </footer>
    <div v-if="grid.menu.value" class="excel-context-menu" role="menu" aria-label="单元格操作" :style="{left:grid.menu.value.x+'px',top:grid.menu.value.y+'px'}" @keydown="menuKey">
      <button role="menuitem" data-action="edit" title="编辑单元格（F2）" @click="grid.select(editor.address.value,true)"><ExcelIcon name="edit" />编辑单元格 <small>F2</small></button>
      <button role="menuitem" data-action="cut" title="剪切（Ctrl+X）" @click="grid.copy(true)"><ExcelIcon name="cut" />剪切 <small>Ctrl+X</small></button>
      <button role="menuitem" data-action="copy" title="复制（Ctrl+C）" @click="grid.copy()"><ExcelIcon name="copy" />复制 <small>Ctrl+C</small></button>
      <button role="menuitem" data-action="paste" title="粘贴（Ctrl+V）" @click="grid.paste()"><ExcelIcon name="paste" />粘贴 <small>Ctrl+V</small></button>
      <button role="menuitem" data-action="clear" title="清空内容（Delete）" @click="grid.clear"><ExcelIcon name="clear" />清空内容 <small>Delete</small></button>
      <button role="menuitem" data-action="paste-options" title="选择性粘贴" class="excel-grid-command" @click="advanced?.openPaste($event);grid.closeAll()"><ExcelIcon name="paste" />选择性粘贴…</button>
      <button role="menuitem" data-action="layout" title="行高、列宽与隐藏行列" @click="advanced?.openLayout()"><ExcelIcon name="layout" />行列布局…</button>
      <button role="menuitem" data-action="merge" title="合并单元格" @click="grid.closeAll();editor.merge(grid.range.value)"><ExcelIcon name="merge" />合并单元格</button>
      <button role="menuitem" data-action="unmerge" title="取消合并" @click="grid.closeAll();editor.merge(grid.range.value,true)"><ExcelIcon name="merge" />取消合并</button>
      <hr />
      <button role="menuitem" data-action="align-left" title="内容居左" @click="grid.align('left')"><ExcelIcon name="left" />内容居左</button>
      <button role="menuitem" data-action="align-center" title="内容居中" @click="grid.align('center')"><ExcelIcon name="center" />内容居中</button>
      <button role="menuitem" data-action="align-right" title="内容居右" @click="grid.align('right')"><ExcelIcon name="right" />内容居右</button>
      <hr />
      <button role="menuitem" data-action="insert-above" title="在上方插入行" @click="grid.structure('row','insert','before')"><ExcelIcon name="above" />在上方插入行</button>
      <button role="menuitem" data-action="insert-below" title="在下方插入行" @click="grid.structure('row','insert','after')"><ExcelIcon name="below" />在下方插入行</button>
      <button role="menuitem" data-action="insert-left" title="在左侧插入列" @click="grid.structure('column','insert','before')"><ExcelIcon name="before" />在左侧插入列</button>
      <button role="menuitem" data-action="insert-right" title="在右侧插入列" @click="grid.structure('column','insert','after')"><ExcelIcon name="after" />在右侧插入列</button>
      <button role="menuitem" data-action="insert-custom" title="自定义插入行/列及数量" @click="grid.openCustom"><ExcelIcon name="custom" />自定义插入…</button>
      <hr />
      <button role="menuitem" data-action="delete-row" title="删除当前行" @click="grid.structure('row','delete','before')"><ExcelIcon name="row" />删除当前行</button>
      <button role="menuitem" data-action="delete-column" title="删除当前列" @click="grid.structure('column','delete','before')"><ExcelIcon name="column" />删除当前列</button>
    </div>
    <div v-if="grid.custom.value" class="excel-insert-overlay" @pointerdown.self="grid.closeAll">
      <form class="excel-insert-dialog" role="dialog" aria-modal="true" aria-label="自定义插入行列" @keydown.tab="dialogTab" @submit.prevent="grid.structure(grid.customAxis.value,'insert',grid.customSide.value,grid.customCount.value)">
        <strong>在 {{editor.address.value}} 附近插入</strong>
        <label>插入类型<select v-model="grid.customAxis.value" aria-label="插入类型" :disabled="editor.saving.value"><option value="row">整行</option><option value="column">整列</option></select></label>
        <label>位置<select v-model="grid.customSide.value" aria-label="插入位置" :disabled="editor.saving.value"><option value="before">{{grid.customAxis.value==='row'?'上方':'左侧'}}</option><option value="after">{{grid.customAxis.value==='row'?'下方':'右侧'}}</option></select></label>
        <label>数量<input v-model.number="grid.customCount.value" class="excel-insert-count" aria-label="插入数量" :disabled="editor.saving.value" type="number" min="1" max="1000" step="1" required /></label>
        <div><button type="button" :disabled="editor.saving.value" @click="grid.closeAll">取消</button><button type="submit" :disabled="editor.saving.value">{{editor.saving.value?'调整中…':'插入'}}</button></div>
        <p v-if="editor.error.value" class="excel-edit-error" role="alert">{{editor.error.value}}</p>
        <small>整行/整列移动，保留普通样式与合并区域；可撤销，源文件不变。</small>
      </form>
    </div>
    <PageNavigation
      v-if="rowCount > pageRows"
      :current="rowPage + 1"
      :total="Math.ceil(rowCount / pageRows)"
      label="行分组"
      @jump="jump"
    />
  </section>
</template>
