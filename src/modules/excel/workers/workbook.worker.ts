import { loadWorkbook } from '../core/workbook/loadWorkbook';
import { workbookAppearance, type WorkbookReply, type WorkbookRequest } from '../core/workbook/previewModel';

let acknowledge: (() => void) | undefined;
let started = false;
function send(part: WorkbookReply, transfer: Transferable[] = []) {
  return new Promise<void>(resolve => {
    acknowledge = resolve;
    self.postMessage(part, { transfer });
  });
}
self.onmessage = async (event: MessageEvent<WorkbookRequest>) => {
  if (event.data.kind === 'ack') { const done = acknowledge; acknowledge = undefined; done?.(); return; }
  if (started) return;
  started = true;
  try {
    const loaded = await loadWorkbook(event.data.bytes, event.data.ext);
    let appearance: ReturnType<typeof workbookAppearance>;
    try { appearance = workbookAppearance(loaded.styled); }
    catch { loaded.warning = '部分样式或图片无法还原，已使用基础表格预览；单元格数据仍可查看。'; }
    loaded.styled = undefined;
    // Internal ZIP/shared-string tables are unnecessary for display or in-memory edits.
    // Export still starts from the protected source bytes through the existing writer.
    await send({ kind: 'book', styled: Boolean(appearance), book: {
      SheetNames: loaded.book.SheetNames, Workbook: loaded.book.Workbook,
      Props: loaded.book.Props, Custprops: loaded.book.Custprops,
      SSF: (loaded.book as typeof loaded.book & { SSF?: Record<string, string> }).SSF,
    } });
    for (const name of loaded.book.SheetNames) {
      const source = loaded.book.Sheets[name], metadata = Object.create(null);
      for (const key of Object.keys(source)) if (key.startsWith('!')) metadata[key] = source[key];
      const style = appearance?.sheets[name];
      await send({ kind: 'sheet', name, metadata, appearance: style ? { rows: style.rows, columns: style.columns, images: style.images } : undefined });
      let cells: Array<[string, typeof source[string]]> = [];
      for (const address of Object.keys(source)) {
        if (address.startsWith('!')) continue;
        cells.push([address, source[address]]);
        if (cells.length === 2048) { await send({ kind: 'cells', name, cells }); cells = []; }
      }
      if (cells.length) await send({ kind: 'cells', name, cells });
      if (style) {
        let cells: Array<[string, typeof style.cells[string]]> = [];
        for (const address of Object.keys(style.cells)) {
          cells.push([address, style.cells[address]]);
          if (cells.length === 2048) { await send({ kind: 'styles', name, cells }); cells = []; }
        }
        if (cells.length) await send({ kind: 'styles', name, cells });
      }
    }
    for (const [id, media] of Object.entries(appearance?.media ?? {})) {
      await send({ kind: 'media', id: Number(id), media }, media.buffer ? [media.buffer.buffer as ArrayBuffer] : []);
    }
    self.postMessage({ kind: 'done', warning: loaded.warning } satisfies WorkbookReply);
  } catch (error) {
    self.postMessage({ kind: 'error', error: error instanceof Error ? error.message : '无法解析表格。' } satisfies WorkbookReply);
  }
};
