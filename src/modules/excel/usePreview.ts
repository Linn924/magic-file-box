import {
  computed,
  nextTick,
  watch,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  type CSSProperties,
} from "vue";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import {useEditor} from './useEditor';
import { loadWorkbook } from './loadWorkbook';
import { previewError } from '../../../shared/previewError';
import type { PreviewFile } from "../../types";
import type { PreviewProps, PreviewEmit } from "../types";
export function usePreview(props: PreviewProps, emit: PreviewEmit) {
  const pane = ref<HTMLElement>();
  const book = shallowRef<XLSX.WorkBook>();
  let styled: ExcelJS.Workbook | undefined;
  const warning = ref('');
  const restored = props.file.view?.excel;
  const sheetName = ref("");
  const editor=useEditor(props.file,book,sheetName);
  const rowPage = ref(0);
  const colPage = ref(0);
  const pageRows = 200,
    pageCols = 100;
  const widths = ref<Record<string, number>>({ ...restored?.widths });
  let initialized = false;
  function resizeColumn(event: PointerEvent, c: number) {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement,
      start = event.clientX,
      width = colWidth(c);
    element.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      widths.value = {
        ...widths.value,
        [sheetName.value + ":" + c]: Math.max(
          40,
          Math.min(1800, width + (e.clientX - start) / (props.zoom / 100)),
        ),
      };
    };
    const up = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
  }
  const sheet = computed(() => book.value?.Sheets[sheetName.value]);
  const styledSheet = computed(() => styled?.getWorksheet(sheetName.value));
  const range = computed(() =>
    sheet.value?.["!ref"]
      ? XLSX.utils.decode_range(sheet.value["!ref"])
      : undefined,
  );
  const rowCount = computed(() => Math.max(range.value?range.value.e.r+1:0,editor.extent(sheetName.value).rows,editor.editing.value?20:0));
  const colCount = computed(() => Math.max(range.value?range.value.e.c+1:0,editor.extent(sheetName.value).cols,editor.editing.value?12:0));
  const startRow = computed(() => 0);
  /** Highest row the user has reached (for progressive jump targets). */
  const loadedRowCount = ref(200);
  const VIEWPORT_ROW_BUFFER = 30;
  const scrollTop = ref(0);
  const clientHeight = ref(600);
  const rowOffsets = computed(() => {
    const heights: number[] = [0];
    let total = 0;
    for (let r = 0; r < rowCount.value; r++) {
      total += rowHeight(r);
      heights.push(total);
    }
    return heights;
  });
  const totalTableHeight = computed(
    () => rowOffsets.value[rowCount.value] || 0,
  );
  function rowAtOffset(y: number) {
    const heights = rowOffsets.value;
    let lo = 0,
      hi = rowCount.value;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (heights[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  const virtualStart = computed(() =>
    Math.max(
      0,
      rowAtOffset(Math.max(0, scrollTop.value)) - VIEWPORT_ROW_BUFFER,
    ),
  );
  const virtualEnd = computed(() =>
    Math.min(
      rowCount.value,
      rowAtOffset(scrollTop.value + clientHeight.value) + VIEWPORT_ROW_BUFFER,
    ),
  );
  watch([sheetName, colPage, loadedRowCount, widths], () => {
    if (!initialized) return;
    props.file.view ??= { zoom: props.zoom, scroll: [] };
    props.file.view.excel = { sheet: sheetName.value, columns: colPage.value, rows: loadedRowCount.value, widths: { ...widths.value } };
  }, { deep: true, flush: 'sync' });
  const scroll = ref<HTMLElement>();
  function onScroll() {
    const el = scroll.value;
    if (!el) return;
    const scale=props.zoom/100;
    scrollTop.value = Math.max(0,el.scrollTop/scale-28);
    clientHeight.value = el.clientHeight/scale;
    // Keep a generous loaded window so jump-to-page can still land.
    const lastVisible = rowAtOffset(scrollTop.value + clientHeight.value);
    if (lastVisible + 200 > loadedRowCount.value)
      loadedRowCount.value = Math.min(rowCount.value, lastVisible + 400);
    const top = el.getBoundingClientRect().top;
    const rows = Array.from(el.querySelectorAll<HTMLElement>("tbody tr[data-row]")).filter(row=>Number(row.dataset.row)>=bodyStart.value);
    const first = rows.find((r) => r.getBoundingClientRect().bottom > top + 28);
    if (first) rowPage.value = Math.floor(Number(first.dataset.row) / pageRows);
  }
  async function jump(value: number) {
    const page = Math.max(
      1,
      Math.min(Math.ceil(rowCount.value / pageRows), Math.floor(value) || 1),
    );
    const targetRow = (page - 1) * pageRows;
    loadedRowCount.value = Math.max(loadedRowCount.value, Math.min(rowCount.value, targetRow + pageRows));
    await nextTick();
    const y = rowOffsets.value[targetRow] || 0;
    if (scroll.value) scroll.value.scrollTop = Math.max(0, y * (props.zoom/100));
    scrollTop.value = Math.max(0,(scroll.value?.scrollTop||0)/(props.zoom/100)-28);
    clientHeight.value = (scroll.value?.clientHeight||600)/(props.zoom/100);
    rowPage.value = page - 1;
  }
  /** Jump to A1-style reference. Returns false if invalid. */
  async function locateCell(refText: string) {
    const m = String(refText || "")
      .trim()
      .toUpperCase()
      .match(/^([A-Z]+)(\d+)$/);
    if (!m) return false;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    col -= 1;
    const row = Number(m[2]) - 1;
    if (row < 0 || col < 0 || row >= rowCount.value || col >= colCount.value)
      return false;
    colPage.value = Math.floor(col / pageCols);
    loadedRowCount.value = Math.max(
      loadedRowCount.value,
      Math.min(rowCount.value, row + pageRows),
    );
    await nextTick();
    const y = rowOffsets.value[row] || 0;
    if (scroll.value) {
      let left = 46;
      for (let i = 0; i < col - startCol.value; i++)
        left += colWidth(startCol.value + i);
      scroll.value.scrollTop = Math.max(0, y * (props.zoom/100));
      scroll.value.scrollLeft = Math.max(0, (left - 80)*(props.zoom/100));
    }
    scrollTop.value = Math.max(0,(scroll.value?.scrollTop||0)/(props.zoom/100)-28);
    clientHeight.value = (scroll.value?.clientHeight||600)/(props.zoom/100);
    rowPage.value = Math.floor(row / pageRows);
    return true;
  }
  const freezeFirstRow = ref(true);
  const freezeFirstCol = ref(true);
  /** Extra frozen body rows / data cols beyond the first (sticky headers always frozen). */
  const freezeRows = ref(0);
  const freezeCols = ref(0);
  function clampFreeze(n: number) {
    return Math.max(0, Math.min(8, Math.floor(n) || 0));
  }
  watch(freezeRows, (v) => {
    freezeRows.value = clampFreeze(v);
  });
  watch(freezeCols, (v) => {
    freezeCols.value = clampFreeze(v);
  });
  watch(()=>props.zoom,async()=>{await nextTick();onScroll();});
  const HEADER_H = 28;
  const ROW_HEAD_W = 46;
  const freezeTop = computed(() => {
    const tops: number[] = [];
    let y = HEADER_H;
    for (let r = 0; r < freezeRows.value; r++) {
      tops.push(y);
      y += rowHeight(r);
    }
    return tops;
  });
  const freezeLeft = computed(() => {
    const lefts: number[] = [];
    let x = ROW_HEAD_W;
    for (let c = 0; c < freezeCols.value; c++) {
      lefts.push(x);
      x += colWidth(startCol.value + c);
    }
    return lefts;
  });
  watch(sheetName, () => {
    loadedRowCount.value = 200;
    rowPage.value = 0;
    scrollTop.value = 0;
    if (scroll.value) scroll.value.scrollTop = 0;
  });
  const startCol = computed(() => colPage.value * pageCols);
  const endRow = computed(() => loadedRowCount.value);
  const endCol = computed(() =>
    Math.min(colCount.value, startCol.value + pageCols),
  );
  function rowHeight(r: number) {
    const row = styledSheet.value?.getRow(r + 1);
    const fallback = sheet.value?.["!rows"]?.[r];
    return row?.hidden || fallback?.hidden
      ? 0
      : ((row?.height || fallback?.hpt || 18) * 4) / 3;
  }
  function colWidth(c: number) {
    const col = styledSheet.value?.getColumn(c + 1);
    const fallback = sheet.value?.["!cols"]?.[c];
    return col?.hidden || fallback?.hidden
      ? 0
      : widths.value[sheetName.value + ":" + c] ||
          fallback?.wpx ||
          (col?.width || fallback?.wch || 12) * 7 + 5;
  }
  const columns = computed(() =>
    Array.from(
      { length: Math.max(0, endCol.value - startCol.value) },
      (_, i) => startCol.value + i,
    ).filter((c) => colWidth(c) > 0),
  );
  const theme = [
    "#ffffff",
    "#000000",
    "#e7e6e6",
    "#44546a",
    "#4472c4",
    "#ed7d31",
    "#a5a5a5",
    "#ffc000",
    "#5b9bd5",
    "#70ad47",
  ];
  function color(
    value?: Partial<ExcelJS.Color> & {
      rgb?: string;
      indexed?: number;
      theme?: number;
      tint?: number;
    },
  ): string | undefined {
    if (!value) return undefined;
    const hex =
      "argb" in value ? value.argb : "rgb" in value ? value.rgb : undefined;
    let result = hex
      ? "#" + hex.slice(-6)
      : value.theme !== undefined
        ? theme[value.theme]
        : value.indexed === 64
          ? "#000000"
          : undefined;
    if (result && value.tint) {
      const t = value.tint;
      result =
        "#" +
        [1, 3, 5]
          .map((i) =>
            Math.round(
              t < 0
                ? parseInt(result!.slice(i, i + 2), 16) * (1 + t)
                : parseInt(result!.slice(i, i + 2), 16) * (1 - t) + 255 * t,
            )
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
    }
    return result;
  }
  function fontStyle(font?: Partial<ExcelJS.Font>): CSSProperties {
    return font
      ? {
          fontFamily: font.name
            ? `"${font.name.replace(/["\\]/g, "")}", "Microsoft YaHei", sans-serif`
            : undefined,
          fontSize: font.size ? font.size + "pt" : undefined,
          fontWeight: font.bold ? "700" : undefined,
          fontStyle: font.italic ? "italic" : undefined,
          textDecoration:
            [
              font.underline ? "underline" : "",
              font.strike ? "line-through" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined,
          color: color(font.color),
        }
      : {};
  }
  function styleAt(r: number, c: number): CSSProperties {
    const cell = styledSheet.value?.getCell(r + 1, c + 1);
    const basic = sheet.value?.[XLSX.utils.encode_cell({ r, c })];
    const s = cell?.style;
    const changed=editor.patchMap.value.get(JSON.stringify([sheetName.value,XLSX.utils.encode_cell({r,c})]));
    const result: CSSProperties = {
      ...fontStyle(s?.font),
      textAlign:
        s?.alignment?.horizontal === "centerContinuous"
          ? "center"
          : (s?.alignment?.horizontal as CSSProperties["textAlign"]) ||
            (changed?(changed.kind==='number'?'right':'left'):(basic?.t === "n" ? "right" : "left")),
      verticalAlign:
        s?.alignment?.vertical === "middle"
          ? "middle"
          : s?.alignment?.vertical || "bottom",
      whiteSpace: s?.alignment?.wrapText ? "pre-wrap" : "pre",
      paddingLeft: s?.alignment?.indent
        ? s.alignment.indent * 8 + 4 + "px"
        : undefined,
    };
    const fill = s?.fill;
    if (fill?.type === "pattern" && fill.pattern !== "none")
      result.backgroundColor = color(fill.fgColor) || color(fill.bgColor);
    if (!fill && basic?.s?.fgColor)
      result.backgroundColor = color(basic.s.fgColor);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const border = s?.border?.[side];
      if (!border?.style) continue;
      const width = border.style.includes("medium")
        ? 2
        : border.style === "thick"
          ? 3
          : 1;
      const line =
        border.style === "double"
          ? "double"
          : /dash/i.test(border.style)
            ? "dashed"
            : border.style === "dotted"
              ? "dotted"
              : "solid";
      (result as Record<string, string>)[
        `border${side[0].toUpperCase() + side.slice(1)}`
      ] =
        `${line === "double" ? 3 : width}px ${line} ${color(border.color) || "#222"}`;
    }
    return result;
  }
  const frozenCount=computed(()=>Math.min(freezeRows.value,rowCount.value));
  const bodyStart=computed(()=>Math.max(frozenCount.value,virtualStart.value));
  const rowNumbers=computed(()=>[...Array.from({length:frozenCount.value},(_,i)=>i),...Array.from({length:Math.max(0,virtualEnd.value-bodyStart.value)},(_,i)=>bodyStart.value+i)].filter(r=>rowHeight(r)>0));
  const firstBodyRow=computed(()=>rowNumbers.value.find(r=>r>=bodyStart.value)??-1);
  const merged = computed(() => {
    const spans=new Map<string,{rows:number;cols:number;r:number;c:number}|null>();
    const windows=frozenCount.value?[[0,frozenCount.value],[bodyStart.value,virtualEnd.value]]:[[bodyStart.value,virtualEnd.value]];
    for(const m of sheet.value?.['!merges']||[])for(const [start,end] of windows){
      const r0=Math.max(m.s.r,start),r1=Math.min(m.e.r,end-1),c0=Math.max(m.s.c,startCol.value),c1=Math.min(m.e.c,endCol.value-1);
      const visibleRows=Array.from({length:Math.max(0,r1-r0+1)},(_,i)=>r0+i).filter(r=>rowHeight(r)>0);
      const visibleCols=columns.value.filter(c=>c>=c0&&c<=c1);
      if(!visibleRows.length||!visibleCols.length)continue;
      for(const r of visibleRows)for(const c of visibleCols)spans.set(`${r}:${c}`,r===visibleRows[0]&&c===visibleCols[0]?{rows:visibleRows.length,cols:visibleCols.length,r:m.s.r,c:m.s.c}:null);
    }
    return spans;
  });
  function editedNumber(value:number,r:number,c:number){const format=styledSheet.value?.getCell(r+1,c+1).numFmt;try{return format?XLSX.SSF.format(format,value):String(value);}catch{return String(value);}}
  const rows = computed(() =>
    rowNumbers.value
      .filter((r) => rowHeight(r) > 0)
      .map((r) => ({
        r,
        height: rowHeight(r),
        cells: columns.value.flatMap((c) => {
          const merge = merged.value.get(`${r}:${c}`);
          if (merge === null) return [];
          const sourceRow = merge?.r ?? r,
            sourceCol = merge?.c ?? c;
          const value =
            sheet.value?.[
              XLSX.utils.encode_cell({ r: sourceRow, c: sourceCol })
            ];
          const cellAddress=XLSX.utils.encode_cell({r:sourceRow,c:sourceCol});
          const patch=editor.patchMap.value.get(JSON.stringify([sheetName.value,cellAddress]));
          const rich = patch?undefined:styledSheet.value?.getCell(
            sourceRow + 1,
            sourceCol + 1,
          ).value;
          return [
            {
              c,address:cellAddress,
              modified:!!patch,
              text:patch?(patch.kind==='blank'?'':patch.kind==='formula'?'='+patch.value:patch.kind==='number'?editedNumber(patch.value,sourceRow,sourceCol):String(patch.value)):(value?.f&&(editor.changes.value.length||editor.editing.value||value.t==='z'||value.v===undefined||(rich&&typeof rich==='object'&&('formula' in rich||'sharedFormula' in rich)&&rich.result===undefined))?'='+value.f:value?XLSX.utils.format_cell(value):''),
              style: styleAt(sourceRow, sourceCol),
              rowspan: merge?.rows || 1,
              colspan: merge?.cols || 1,
              rich:
                rich && typeof rich === "object" && "richText" in rich
                  ? rich.richText
                  : undefined,
            },
          ];
        }),
      })),
  );
  const padTop = computed(() => Math.max(0,(rowOffsets.value[bodyStart.value]||0)-(rowOffsets.value[frozenCount.value]||0)));
  const padBottom = computed(() =>
    Math.max(0, totalTableHeight.value - (rowOffsets.value[virtualEnd.value] || 0)),
  );
  const imageUrls = new Map<string, string>();
  function offset(from: number, to: number, dimension: (n: number) => number) {
    let result = 0;
    for (
      let i = Math.min(from, Math.floor(to));
      i < Math.max(from, Math.floor(to));
      i++
    )
      result += dimension(i);
    return (
      (to < from ? -result : result) + (to % 1) * dimension(Math.floor(to))
    );
  }
  const images = computed(() =>
    (styledSheet.value?.getImages() || []).flatMap((img) => {
      const anchor = img.range as typeof img.range & {
        ext?: { width: number; height: number };
      };
      if (!anchor?.tl || !styled) return [];
      const id = String(img.imageId);
      let url = imageUrls.get(id);
      if (!url) {
        const media = styled.getImage(Number(img.imageId));
        if (!media) return [];
        if (media.buffer)
          url = URL.createObjectURL(
            new Blob([new Uint8Array(media.buffer).slice().buffer], {
              type: "image/" + media.extension,
            }),
          );
        else if (media.base64)
          url = media.base64.startsWith("data:")
            ? media.base64
            : `data:image/${media.extension};base64,${media.base64}`;
        else return [];
        imageUrls.set(id, url);
      }
      const left = offset(startCol.value, anchor.tl.col, colWidth),
        top = offset(startRow.value, anchor.tl.row, rowHeight);
      const width =
        anchor.ext?.width ||
        (anchor.br
          ? offset(Math.floor(anchor.tl.col), anchor.br.col, colWidth) -
            (anchor.tl.col % 1) * colWidth(Math.floor(anchor.tl.col))
          : 100);
      const height =
        anchor.ext?.height ||
        (anchor.br
          ? offset(Math.floor(anchor.tl.row), anchor.br.row, rowHeight) -
            (anchor.tl.row % 1) * rowHeight(Math.floor(anchor.tl.row))
          : 100);
      if (left + width < 0 || top + height < 0) return [];
      return [
        {
          id,
          url,
          style: {
            left: left + 46 + "px",
            top: top + 28 + "px",
            width: width + "px",
            height: height + "px",
          },
        },
      ];
    }),
  );
  onMounted(async () => {
    try {
      const loaded = await loadWorkbook(props.file.bytes, props.file.ext);
      styled = loaded.styled;
      warning.value = loaded.warning;
      book.value = loaded.book;
      sheetName.value = restored && book.value.SheetNames.includes(restored.sheet) ? restored.sheet : book.value.SheetNames[0] || '';
      await nextTick();
      colPage.value = Math.max(0, Math.min(restored?.columns ?? 0, Math.ceil(colCount.value / pageCols) - 1));
      loadedRowCount.value = Math.min(rowCount.value, Math.max(200, restored?.rows ?? 200));
      await nextTick();
      initialized = true;
      onScroll();editor.initialize();
      emit("ready");
    } catch (e) {
      emit(
        "error",
        previewError(e, '表格文件'),
      );
    }
  });
  onBeforeUnmount(() => {
    for (const url of imageUrls.values())
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    imageUrls.clear();
    styled = undefined;
  });

  return {
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
    virtualStart,
    resizeColumn,
    XLSX,
  };
}
