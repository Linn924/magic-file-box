<script setup lang="ts">
import PageNavigation from "../../components/PageNavigation.vue";
import type { PreviewProps } from "../types";
import { usePreview } from "./usePreview";
import { ref } from "vue";
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const {
  warning,
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
const locateRef = ref("");
const locateMsg = ref("");
async function locate() {
  const ok = await locateCell(locateRef.value);
  locateMsg.value = ok ? `已定位 ${locateRef.value.toUpperCase()}` : "无效单元格，例如 B12";
}
</script>
<template>
  <section ref="pane" class="excel">
    <div v-if="warning" class="notice" role="status">{{ warning }}</div>
    <nav class="sheets" aria-label="工作表">
      <button
        v-for="name in book?.SheetNames"
        :key="name"
        :class="{ active: name === sheetName }"
        @click="
          sheetName = name;
          rowPage = colPage = 0;
        "
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
    <div ref="scroll" class="table-wrap" @scroll.passive="onScroll">
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
