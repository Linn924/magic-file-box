<script setup lang="ts">
import PageNavigation from "../../components/PageNavigation.vue";
import type { PreviewProps } from "../types";
import { usePreview } from "./usePreview";
import {useGridInteraction} from './useGridInteraction';
import { ref } from "vue";
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const {
  warning,editor,
  pane,
  scroll,
  onScroll,
  jump,
  locateCell,
  freezeFirstRow,
  freezeFirstCol,
  freezeRows,
  freezeCols,
  freezeTop,
  freezeLeft,
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
  resizeColumn,
  XLSX,
} = usePreview(props, emit);
const cellInput=ref<HTMLTextAreaElement>();
const grid=useGridInteraction(props.file,editor,rowCount,colCount,locateCell);
function selectSheet(name:string){if(!grid.commit()||!editor.finishCell())return;grid.closeAll();sheetName.value=name;rowPage.value=colPage.value=0;if(editor.editing.value)editor.select('A1',name);}
function headerAddress(axis:'row'|'column',index:number){const current=XLSX.utils.decode_cell(editor.address.value);return XLSX.utils.encode_cell(axis==='row'?{r:index,c:current.c}:{r:current.r,c:index});}
function menuKey(event:KeyboardEvent){if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const buttons=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button'));let index=buttons.indexOf(document.activeElement as HTMLButtonElement);index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index]?.focus();}
function inputKey(event:KeyboardEvent){if(event.isComposing)return;if(event.key==='Enter'&&!event.altKey&&!event.shiftKey){event.preventDefault();editor.finishCell();}else if(event.key==='Escape'){event.preventDefault();editor.cancelInput();cellInput.value?.blur();}}
function dialogTab(event:KeyboardEvent){const fields=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)'));const current=fields.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&current===0){event.preventDefault();fields.at(-1)?.focus();}else if(!event.shiftKey&&current===fields.length-1){event.preventDefault();fields[0]?.focus();}}
const locateRef = ref("");
const locateMsg = ref("");
async function locate() {
  const ok = await locateCell(locateRef.value);
  locateMsg.value = ok ? `已定位 ${locateRef.value.toUpperCase()}` : "无效单元格，例如 B12";
}
</script>
<template>
  <section ref="pane" class="excel" @keydown="grid.key">
    <Teleport :to="`[data-file-id='${props.file.id}'] .module-tools`" defer>
      <span class="excel-edit-tools">
        <button type="button" class="excel-edit-toggle" :aria-pressed="editor.editing.value" :disabled="!editor.canEdit.value||editor.saving.value" :title="editor.canEdit.value?'基础编辑（源文件只读）':'XLS 只支持预览'" @click="editor.toggle()">{{editor.editing.value?'回到预览':'编辑副本'}}</button>
        <button type="button" class="excel-save-copy" :disabled="!editor.canEdit.value||editor.saving.value" @click="editor.save()">{{editor.saving.value?'处理中…':'另存副本'}}</button>
        <select v-model="editor.format.value" aria-label="副本格式" :disabled="editor.saving.value"><option value="xlsx">XLSX</option><option value="csv">CSV（当前工作表）</option><option value="tsv">TSV（当前工作表）</option></select>
        <span class="excel-dirty" role="status">{{editor.dirty.value?'有未保存修改':editor.changes.value.length||editor.baseBytes.value?'副本已保存 · 源文件只读':'源文件只读'}}</span>
      </span>
    </Teleport>
    <div v-if="editor.editing.value" class="excel-editor-bar">
      <span class="excel-cell-address">{{sheetName}}!{{editor.address.value}}</span>
      <textarea ref="cellInput" v-model="editor.input.value" class="excel-cell-input" aria-label="单元格内容" rows="2" :disabled="editor.saving.value" placeholder="文字、数字或 =公式；以 ' 开头强制文字" @keydown="inputKey"></textarea>
      <button type="button" class="excel-apply-cell" :disabled="editor.saving.value" @click="editor.finishCell()">应用</button>
      <button type="button" class="excel-undo" :disabled="editor.saving.value||(!editor.pending.value&&!editor.undoStack.value.length)" @click="editor.undo()">撤销</button>
      <button type="button" class="excel-redo" :disabled="editor.saving.value||editor.pending.value||!editor.redoStack.value.length" @click="editor.redo()">重做</button>
      <button type="button" class="excel-discard" :disabled="editor.saving.value" @click="editor.discard()">恢复源内容</button>
      <small>双击或 F2 在单元格内编辑；Enter/Tab 提交并移动，Esc 取消，Alt+Enter 换行。右键插入/删除行列。公式需在外部表格软件中重算。</small>
    </div>
    <p v-if="editor.error.value" class="excel-edit-error" role="alert">{{editor.error.value}}</p>
    <p v-if="editor.status.value" class="excel-edit-status" role="status">{{editor.status.value}}</p>
    <div v-if="warning" class="notice" role="status">{{ warning }}</div>
    <nav class="sheets" aria-label="工作表">
      <button
        v-for="name in book?.SheetNames"
        :key="name"
        :class="{ active: name === sheetName }"
        :disabled="editor.saving.value"
        @click="selectSheet(name)"
      >
        {{ name }}
      </button>
    </nav>
    <div class="sheet-tools" role="toolbar" aria-label="表格定位与冻结">
      <label class="cell-locate"
        >定位<input
          v-model="locateRef"
          class="cell-locate-input"
          placeholder="如 B12"
          aria-label="定位单元格"
          @keydown.enter.prevent="locate"
        />
        <button type="button" @click="locate">跳转</button>
        </label
      >
      <label class="freeze-toggle"
        ><input v-model="freezeFirstRow" type="checkbox" /> 首行</label
      ><label class="freeze-toggle"
        ><input v-model="freezeFirstCol" type="checkbox" /> 首列</label
      ><label class="freeze-toggle"
        >+行<input
          v-model.number="freezeRows"
          class="freeze-num"
          type="number"
          min="0"
          max="8"
          aria-label="额外冻结行数"
      /></label
      ><label class="freeze-toggle"
        >+列<input
          v-model.number="freezeCols"
          class="freeze-num"
          type="number"
          min="0"
          max="8"
          aria-label="额外冻结列数"
      /></label
      >
      <small v-if="locateMsg" class="locate-status" role="status">{{ locateMsg }}</small>
    </div>
    <div ref="scroll" class="table-wrap" @scroll.passive="onScroll" @paste="grid.pasteEvent">
      <div
        v-if="rows.length"
        class="sheet-surface"
        :class="{
          'freeze-row': freezeFirstRow,
          'freeze-col': freezeFirstCol,
        }"
        :style="{
          zoom: zoom / 100,
          '--freeze-rows': freezeRows,
          '--freeze-cols': freezeCols,
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
              <th></th>
              <th v-for="c in columns" :key="c" :data-column="c" @contextmenu="grid.context($event,headerAddress('column',c),'column',c)">
                {{ XLSX.utils.encode_col(c)
                }}<span
                  class="column-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  title="拖动调整列宽"
                  @pointerdown="resizeColumn($event, c)"
                ></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.r">
            <tr v-if="row.r===firstBodyRow && padTop>0" class="row-virtual-spacer" aria-hidden="true" :style="{height:padTop+'px'}"><td :colspan="columns.length+1"></td></tr>
            <tr
              :data-row="row.r"
              :data-frozen="row.r < freezeRows ? '1' : undefined"
              :style="{
                height: row.height + 'px',
                ...(row.r < freezeRows
                  ? {
                      position: 'sticky' as const,
                      top: (freezeTop[row.r] ?? 28) + 'px',
                      zIndex: 2,
                      background: 'var(--panel)',
                    }
                  : null),
              }"
            >
              <th @contextmenu="grid.context($event,headerAddress('row',row.r),'row',row.r)">{{ row.r + 1 }}</th>
              <td
                v-for="cell in row.cells"
                :key="cell.c"
                :data-address="cell.address"
                :tabindex="editor.editing.value?0:undefined"
                :class="{'excel-selected-cell':editor.editing.value&&editor.address.value===cell.address,'excel-changed-cell':cell.modified}"
                @click="grid.select(cell.address)"
                @dblclick="grid.select(cell.address,true)"
                @contextmenu="grid.context($event,cell.address)"
                :style="[
                  cell.style,
                  cell.c - startCol < freezeCols
                    ? {
                        position: 'sticky' as const,
                        left: (freezeLeft[cell.c - startCol] ?? 46) + 'px',
                        zIndex: 2,
                      }
                    : null,
                ]"
                :rowspan="cell.rowspan"
                :colspan="cell.colspan"
                :title="cell.text"
              >
                <textarea v-if="grid.inline.value&&editor.address.value===cell.address" :ref="(el:any)=>{grid.inlineInput.value=el;}" v-model="editor.input.value" class="excel-inline-input" aria-label="单元格内编辑" :disabled="editor.saving.value" @click.stop @dblclick.stop @keydown.stop="grid.inlineKey" @blur="grid.inlineBlur"></textarea>
                <template v-else-if="cell.rich"
                  ><span
                    v-for="(run, i) in cell.rich"
                    :key="i"
                    :style="fontStyle(run.font)"
                    >{{ run.text }}</span
                  ></template
                ><template v-else>{{ cell.text }}</template>
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
      <button role="menuitem" data-action="edit" @click="grid.select(editor.address.value,true)">编辑单元格 <small>F2</small></button>
      <button role="menuitem" data-action="copy" @click="grid.copy">复制 <small>Ctrl+C</small></button>
      <button role="menuitem" data-action="paste" @click="grid.paste">粘贴 <small>Ctrl+V</small></button>
      <button role="menuitem" data-action="clear" @click="grid.clear">清空内容 <small>Delete</small></button>
      <hr />
      <button role="menuitem" data-action="insert-above" @click="grid.structure('row','insert','before')">在上方插入行</button>
      <button role="menuitem" data-action="insert-below" @click="grid.structure('row','insert','after')">在下方插入行</button>
      <button role="menuitem" data-action="insert-left" @click="grid.structure('column','insert','before')">在左侧插入列</button>
      <button role="menuitem" data-action="insert-right" @click="grid.structure('column','insert','after')">在右侧插入列</button>
      <button role="menuitem" data-action="insert-custom" @click="grid.openCustom">自定义插入…</button>
      <hr />
      <button role="menuitem" data-action="delete-row" @click="grid.structure('row','delete','before')">删除当前行</button>
      <button role="menuitem" data-action="delete-column" @click="grid.structure('column','delete','before')">删除当前列</button>
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
