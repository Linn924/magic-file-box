<script setup lang="ts">
import PageNavigation from "../../components/PageNavigation.vue";
import type { PreviewProps } from "../types";
import { usePreview } from "./usePreview";
import { ref, nextTick } from "vue";
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
function selectSheet(name:string){if(!editor.finishCell())return;sheetName.value=name;rowPage.value=colPage.value=0;if(editor.editing.value)editor.select('A1',name);}
async function selectCell(address:string,focus=false){if(editor.saving.value||!editor.select(address))return;if(focus){await nextTick();cellInput.value?.focus();cellInput.value?.select();}}
function pasteCells(event:ClipboardEvent){if(!editor.editing.value||editor.saving.value)return;if(!event.clipboardData?.types.includes('text/plain'))return;const text=event.clipboardData.getData('text/plain');if(text!==undefined){event.preventDefault();editor.paste(text);}}
function editKey(event:KeyboardEvent){if(!editor.editing.value||editor.saving.value)return;
  if(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select'))return;
  if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();editor.undo();}
  else if(event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();editor.redo();}
}
function inputKey(event:KeyboardEvent){if(event.key==='Enter'&&!event.altKey&&!event.shiftKey){event.preventDefault();editor.finishCell();}else if(event.key==='Escape'){event.preventDefault();editor.cancelInput();cellInput.value?.blur();}}
const locateRef = ref("");
const locateMsg = ref("");
async function locate() {
  const ok = await locateCell(locateRef.value);
  locateMsg.value = ok ? `已定位 ${locateRef.value.toUpperCase()}` : "无效单元格，例如 B12";
}
</script>
<template>
  <section ref="pane" class="excel" @keydown="editKey">
    <Teleport :to="`[data-file-id='${props.file.id}'] .module-tools`" defer>
      <span class="excel-edit-tools">
        <button type="button" class="excel-edit-toggle" :aria-pressed="editor.editing.value" :disabled="!editor.canEdit.value||editor.saving.value" :title="editor.canEdit.value?'基础编辑（源文件只读）':'XLS 只支持预览'" @click="editor.toggle()">{{editor.editing.value?'回到预览':'编辑副本'}}</button>
        <button type="button" class="excel-save-copy" :disabled="!editor.canEdit.value||editor.saving.value" @click="editor.save()">{{editor.saving.value?'保存中…':'另存副本'}}</button>
        <select v-model="editor.format.value" aria-label="副本格式" :disabled="editor.saving.value"><option value="xlsx">XLSX</option><option value="csv">CSV（当前工作表）</option><option value="tsv">TSV（当前工作表）</option></select>
        <span class="excel-dirty" role="status">{{editor.dirty.value?'有未保存修改':editor.changes.value.length?'副本已保存 · 源文件只读':'源文件只读'}}</span>
      </span>
    </Teleport>
    <div v-if="editor.editing.value" class="excel-editor-bar">
      <span class="excel-cell-address">{{sheetName}}!{{editor.address.value}}</span>
      <textarea ref="cellInput" v-model="editor.input.value" class="excel-cell-input" aria-label="单元格内容" rows="2" :disabled="editor.saving.value" placeholder="文字、数字或 =公式；以 ' 开头强制文字" @keydown="inputKey"></textarea>
      <button type="button" class="excel-apply-cell" :disabled="editor.saving.value" @click="editor.finishCell()">应用</button>
      <button type="button" class="excel-undo" :disabled="editor.saving.value||(!editor.pending.value&&!editor.undoStack.value.length)" @click="editor.undo()">撤销</button>
      <button type="button" class="excel-redo" :disabled="editor.saving.value||editor.pending.value||!editor.redoStack.value.length" @click="editor.redo()">重做</button>
      <button type="button" class="excel-discard" :disabled="editor.saving.value" @click="editor.discard()">恢复源内容</button>
      <small>Enter 应用；Shift/Alt+Enter 换行。选中单元格后粘贴表格。公式显示表达式，XLSX 副本需在表格软件中重算。</small>
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
    <div ref="scroll" class="table-wrap" @scroll.passive="onScroll" @paste="pasteCells">
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
              <th v-for="c in columns" :key="c">
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
              <th>{{ row.r + 1 }}</th>
              <td
                v-for="cell in row.cells"
                :key="cell.c"
                :data-address="cell.address"
                :tabindex="editor.editing.value?0:undefined"
                :class="{'excel-selected-cell':editor.editing.value&&editor.address.value===cell.address,'excel-changed-cell':cell.modified}"
                @click="selectCell(cell.address)"
                @dblclick="selectCell(cell.address,true)"
                @keydown.enter.prevent="selectCell(cell.address,true)"
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
                <template v-if="cell.rich"
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
    <PageNavigation
      v-if="rowCount > pageRows"
      :current="rowPage + 1"
      :total="Math.ceil(rowCount / pageRows)"
      label="行分组"
      @jump="jump"
    />
  </section>
</template>
