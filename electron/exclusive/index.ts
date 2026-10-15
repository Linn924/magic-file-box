import {app, ipcMain, safeStorage} from 'electron';
import path from 'node:path';
import {EXCLUSIVE_PUBLIC_KEY} from '@shared/exclusiveKey';
import {trusted} from '../security';
import {ExclusiveStore} from './store';

export function setupExclusive() {
  const store = new ExclusiveStore(path.join(app.getPath('userData'), 'exclusive.bin'), EXCLUSIVE_PUBLIC_KEY, safeStorage);
  const allowed = (event: Electron.IpcMainInvokeEvent) => {
    trusted(event);
    const url = new URL(event.senderFrame!.url);
    if(url.pathname !== '/index.html' || url.searchParams.has('print') || url.searchParams.has('print-panel')) throw Error('无效设置窗口。');
  };
  ipcMain.handle('exclusive:get', event => {allowed(event);return store.snapshot();});
  ipcMain.handle('exclusive:activate', (event, key: unknown) => {allowed(event);return store.activate(key);});
  ipcMain.handle('exclusive:clear', event => {allowed(event);return store.clear();});
  return store;
}
