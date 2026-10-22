import { ipcMain, type WebContents } from 'electron';
import { trusted } from '../security';
import { loadPreparedFile } from './';
import { canPreviewFile } from './transfers';
import type { PreviewFile } from '@shared/files';

const reads = new Map<string, { owner: number; controller: AbortController }>();
type Parser = { owner: number; granted: boolean; resolve: (granted: boolean) => void };
const parsers = new Map<string, Parser>();
const watched = new WeakSet<WebContents>();
function key(owner: number, token: string) {
  if (typeof token !== 'string' || !/^[\w-]{1,80}$/.test(token)) throw Error('无效的加载任务。');
  return owner + ':' + token;
}
function advance() {
  if ([...parsers.values()].some(task => task.granted)) return;
  const task = parsers.values().next().value as Parser | undefined;
  if (task) { task.granted = true; task.resolve(true); }
}
function releaseParser(id: string) {
  const task = parsers.get(id);
  if (!task) return;
  parsers.delete(id);
  if (!task.granted) task.resolve(false);
  advance();
}
function watchOwner(sender: WebContents) {
  if (watched.has(sender)) return;
  watched.add(sender);
  const clear = () => {
    for (const [id, task] of reads) if (task.owner === sender.id) {
      reads.delete(id); task.controller.abort();
    }
    // Remove all of this owner's tasks before granting another lease.
    for (const [id, task] of parsers) if (task.owner === sender.id) {
      parsers.delete(id); if (!task.granted) task.resolve(false);
    }
    advance();
  };
  sender.once('destroyed', clear);
  sender.on('render-process-gone', clear);
  sender.on('did-start-navigation', details => { if (details.isMainFrame) clear(); });
}
export function previewTaskStats() { return { reads: reads.size, parsers: parsers.size, activeParsers: [...parsers.values()].filter(task => task.granted).length }; }
export function setupPreviewTasks() {
  ipcMain.handle('preview:load', async (event, file: PreviewFile, token?: string) => {
    trusted(event);
    if (!file || !canPreviewFile(event.sender.id, file.id)) throw Error('文件已关闭或不属于当前窗口。');
    if (token === undefined) return loadPreparedFile(file,undefined,true);
    const id = key(event.sender.id, token);
    if (reads.has(id)) throw Error('加载任务已存在。');
    watchOwner(event.sender);
    const task = { owner: event.sender.id, controller: new AbortController() };
    reads.set(id, task);
    try { return await loadPreparedFile(file, task.controller.signal); }
    catch (error) { if (task.controller.signal.aborted) return { ...file, bytes: new Uint8Array(), error: '已取消加载。' }; throw error; }
    finally { if (reads.get(id) === task) reads.delete(id); }
  });
  ipcMain.handle('preview:cancel-load', (event, token: string) => {
    trusted(event);
    const id = key(event.sender.id, token), task = reads.get(id);
    if (task) { reads.delete(id); task.controller.abort(); }
  });
  ipcMain.handle('preview:acquire-parser', (event, fileId: string, token: string) => {
    trusted(event);
    if (!canPreviewFile(event.sender.id, fileId)) throw Error('文件已关闭或不属于当前窗口。');
    const id = key(event.sender.id, token);
    if (parsers.has(id) || parsers.size >= 256) throw Error('解析任务过多，请关闭闲置文件后重试。');
    watchOwner(event.sender);
    return new Promise<boolean>(resolve => {
      parsers.set(id, { owner: event.sender.id, granted: false, resolve });
      advance();
    });
  });
  ipcMain.handle('preview:release-parser', (event, token: string) => {
    trusted(event); releaseParser(key(event.sender.id, token));
  });
}
