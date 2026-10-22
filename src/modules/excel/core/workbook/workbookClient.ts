import type { PreviewTask } from '@shared/previewLoading';
import type { WorkbookPreview, WorkbookReply } from './previewModel';

/** One disposable worker per parse; the main process admits one parser across all windows. */
export async function loadWorkbookPreview(id: string, bytes: Uint8Array, ext: string, task: PreviewTask): Promise<WorkbookPreview> {
  task.signal.throwIfAborted();
  const token = crypto.randomUUID();
  let worker: Worker | undefined;
  let acknowledgement: ReturnType<typeof setTimeout> | undefined;
  const release = () => { clearTimeout(acknowledgement); worker?.terminate(); worker = undefined; void window.localPreview.releasePreviewParser(token).catch(() => {}); };
  const abort = () => release();
  task.signal.addEventListener('abort', abort, { once: true });
  try {
    task.report('queued');
    const admitted = await window.localPreview.acquirePreviewParser(id, token);
    task.signal.throwIfAborted();
    if (!admitted) throw new DOMException('已取消解析。', 'AbortError');
    task.report('parsing');
    return await new Promise<WorkbookPreview>((resolve, reject) => {
      let result: WorkbookPreview | undefined;
      const cancel = () => reject(task.signal.reason);
      task.signal.addEventListener('abort', cancel, { once: true });
      const settle = (result?: WorkbookPreview, error?: unknown) => {
        task.signal.removeEventListener('abort', cancel);
        if (error) reject(error); else resolve(result!);
      };
      try {
        worker = new Worker(new URL('../../workers/workbook.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkbookReply>) => {
          if (task.signal.aborted) return;
          const part = event.data;
          if (part.kind === 'error') { settle(undefined, new Error(part.error)); return; }
          if (part.kind === 'book') {
            task.report('rendering');
            result = { book: { ...part.book, Sheets: Object.create(null) },
              appearance: part.styled ? { sheets: Object.create(null), media: Object.create(null) } : undefined, warning: '' };
          }
          else if (result) {
            if (part.kind === 'sheet') {
              result.book.Sheets[part.name] = part.metadata;
              if (part.appearance && result.appearance) result.appearance.sheets[part.name] = { ...part.appearance, cells: Object.create(null) };
            } else if (part.kind === 'cells') {
              const sheet = result.book.Sheets[part.name];
              for (const [address, cell] of part.cells) sheet[address] = cell;
            } else if (part.kind === 'styles') {
              const sheet = result.appearance!.sheets[part.name];
              for (const [address, cell] of part.cells) sheet.cells[address] = cell;
            } else if (part.kind === 'media') result.appearance!.media[part.id] = part.media;
            else if (part.kind === 'done') { result.warning = part.warning; settle(result); return; }
          }
          // Backpressure: never queue the whole workbook in the renderer message loop.
          acknowledgement = setTimeout(() => worker?.postMessage({ kind: 'ack' }), 0);
        };
        worker.onerror = event => { event.preventDefault(); settle(undefined, new Error('后台表格解析失败，请重试。')); };
        worker.onmessageerror = () => settle(undefined, new Error('无法接收表格解析结果，请重试。'));
        // Cache/editor own the source. Transfer only a private copy, never detach shared bytes.
        const copy = bytes.slice();
        worker.postMessage({ kind: 'parse', bytes: copy, ext }, [copy.buffer]);
      } catch (error) { settle(undefined, error); }
    });
  } finally {
    task.signal.removeEventListener('abort', abort);
    release();
  }
}
