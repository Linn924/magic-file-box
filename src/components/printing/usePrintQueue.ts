import { computed, ref, toRaw } from "vue";
import type { PreviewFile } from "@shared/contracts";
import {
  printDefaults,
  type PdfPrintOptions,
} from "@shared/printing";
import { printError } from "./errorMessage";
export interface PrintRow {
  file: PreviewFile;
  options: PdfPrintOptions;
  selected: boolean;
  expanded: boolean;
  status: string;
  statusKind: 'waiting'|'submitted'|'cancelled'|'failed';
}
export function usePrintQueue(initial?: PreviewFile) {
  const row = (file: PreviewFile): PrintRow => ({
    file,
    options: { ...printDefaults },
    selected: true,
    expanded:false,
    status: file.error || "等待",
    statusKind:file.error?'failed':'waiting',
  });
  const files = ref<PrintRow[]>(initial ? [row(initial)] : []),
    deviceName = ref(""),
    busy = ref(false),
    stop = ref(false),
    batchProgress = ref("");
  const selectedCount = computed(
    () => files.value.filter((r) => r.selected).length,
  );
  function add(items: PreviewFile[]) {
    for (const file of items)
      if (!files.value.some((r) => r.file.id === file.id))
        files.value.push(row(file));
  }
  function applyAll(source: PrintRow) {
    for (const target of files.value) target.options = { ...source.options };
  }
  function move(index: number, offset: number) {
    const next = index + offset;
    if (next >= 0 && next < files.value.length)
      [files.value[index], files.value[next]] = [
        files.value[next],
        files.value[index],
      ];
  }
  async function start() {
    if (busy.value || !deviceName.value) return;
    busy.value = true;
    stop.value = false;
    const jobs = files.value
      .filter((r) => r.selected)
      .map((r) => ({
        row: r,
        file: toRaw(r.file),
        options: { ...toRaw(r.options), deviceName: deviceName.value },
      }));
    for (const r of files.value) {r.status = r.selected ? "等待" : "未勾选";r.statusKind='waiting';}
    batchProgress.value = `0/${jobs.length}`;
    try {
      let done = 0;
      for (const job of jobs) {
        batchProgress.value = `${done}/${jobs.length}`;
        if (stop.value) {
          job.row.status = "未提交";
          continue;
        }
        if (job.file.error) {
          job.row.statusKind='failed';
          job.row.status = "失败：" + job.file.error;
          continue;
        }
        job.row.status = "正在准备并提交";
        try {
          const result=await window.localPreview.printPdf({
            file: job.file,
            options: job.options,
          });
          job.row.statusKind=result.status;
          job.row.status = result.status==='submitted'?'已提交到系统队列（是否出纸以队列/打印机为准）':result.status==='cancelled'?'用户已取消':'驱动提交受阻：'+(result.reason||'未知原因');
        } catch (e) {
          job.row.statusKind='failed';
          job.row.status = "失败：" + printError(e);
        }
        done++;
        batchProgress.value = `${done}/${jobs.length}`;
      }
    } finally {
      busy.value = false;
      batchProgress.value = "";
    }
  }
  return {
    files,
    deviceName,
    busy,
    stop,
    batchProgress,
    selectedCount,
    add,
    applyAll,
    move,
    start,
  };
}
