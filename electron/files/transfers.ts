import {forgetModified,transferModified} from './modifiedFiles';
import { ipcMain, webContents, type WebContents } from "electron";
import { trusted } from "../security";
import type { PreviewFile } from "@shared/contracts";
import { retainPreparedFiles, releasePreparedOwner, releasePreparedReference, transferPreparedReference,discardUnownedFiles,ownsPreparedFile } from './';
const owners = new Map<string, number>();
const pending = new Map<
  string,
  {
    source: number;
    target: number;
    timer: ReturnType<typeof setTimeout>;
    resolve: (file: PreviewFile) => void;
    reject: (error: Error) => void;
  }
>();
export function registerFiles(sender: number, files: PreviewFile[]) {
  const window=webContents.fromId(sender);
  if(!window||window.isDestroyed()){discardUnownedFiles(files);return;}
  retainPreparedFiles(sender,files);
  for (const file of files) owners.set(file.id, sender);
}
export function hasPendingTransfers(){return pending.size>0;}
/** A claimed target may start loading before its mount is acknowledged by tabs:accept. */
export function canPreviewFile(sender: number, id: string) {
  const transfer = pending.get(id);
  return ownsPreparedFile(sender, id) || Boolean(transfer?.target === sender && ownsPreparedFile(transfer.source, id));
}
export function releaseWindow(sender: number) {
  forgetModified(sender);
  releasePreparedOwner(sender);
  for (const [id, owner] of owners) if (owner === sender)owners.delete(id);
  for (const [id, p] of pending)
    if (p.source === sender || p.target === sender) {
      clearTimeout(p.timer);
      p.reject(Error("窗口已关闭，文件未移动。"));
      pending.delete(id);
    }
}
export function setupTransfers() {
  ipcMain.handle("tabs:claim", (event, id: string) => {
    trusted(event);
    const source = owners.get(id),
      target = event.sender.id;
    if (
      !event.sender.getURL().includes("?preview=1") ||
      source === undefined ||
      source === target ||
      pending.has(id)
    )
      throw Error("无法移动此标签，请重新拖动。");
    const owner = webContents.fromId(source);
    if (!owner || owner.isDestroyed()) throw Error("来源窗口已关闭。");
    return new Promise<PreviewFile>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("移动超时，原窗口中的文件仍保留。"));
      }, 15000);
      pending.set(id, { source, target, timer, resolve, reject });
      owner.send("tabs:export", id);
    });
  });
  ipcMain.on("tabs:supply", (event, file: PreviewFile) => {
    const p = pending.get(file?.id);
    if (!p || p.source !== event.sender.id) return;
    p.resolve(file);
  });
  ipcMain.handle("tabs:accept", (event, id: string) => {
    trusted(event);
    const p = pending.get(id);
    if (!p || p.target !== event.sender.id) throw Error("移动已取消。");
    clearTimeout(p.timer);
    pending.delete(id);
    owners.set(id, p.target);
    transferModified(p.source,p.target,id);
    // Retain destination before source tab acknowledges its removal.
    transferPreparedReference(p.source,p.target,id);
    webContents.fromId(p.source)?.send("tabs:remove", id);
  });
  ipcMain.on("tabs:release", (event, id: string) => {
    forgetModified(event.sender.id,id);
    releasePreparedReference(event.sender.id,id);
    if (owners.get(id) === event.sender.id)owners.delete(id);
  });
}
