import { BrowserWindow, ipcMain, dialog, shell, type Session } from "electron";
import path from "node:path";
import { randomUUID } from 'node:crypto';
import { trusted, protectWindow } from "../security";
import { preparePreviewFile,loadPreparedFile,retainPreparedFiles,discardUnownedFiles } from "../files";
import { validatePrintOptions, type PdfPrintJob, type PrintSubmitResult } from "@shared/printing";
interface ActiveJob {
  owner: number;
  job?: PdfPrintJob;
  resolve: (result:PrintSubmitResult) => void;
  reject: (e: Error) => void;
  window: BrowserWindow;
  timer: ReturnType<typeof setTimeout>;
  submitting?: boolean;
  token: string;
  consumed?: boolean;
}
const jobs = new Map<number, ActiveJob>();
export function hasActivePrintJobs(){return jobs.size>0;}
let queue = Promise.resolve();
let worker: BrowserWindow | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
export function setupPrinting(local: Session) {
  ipcMain.handle("print:drop",async(event,paths:unknown)=>{trusted(event);if(!Array.isArray(paths)||paths.some(p=>typeof p!=="string"||!path.isAbsolute(p)))throw Error("请只拖入本机文件。");
    const allowed=new Set(["pdf","png","jpg","jpeg","webp","gif","bmp","svg","docx"]);
    if(paths.some(name=>!allowed.has(path.extname(name).slice(1).toLowerCase())))throw Error('支持 PDF、图片和 DOCX。');
    const files=[];for(const name of paths)files.push(await preparePreviewFile(name));
    if(event.sender.isDestroyed()){discardUnownedFiles(files);throw Error('打印窗口已关闭。');}
    retainPreparedFiles(event.sender.id,files);return files;});
  ipcMain.handle("print:printers", async (event) => {
    trusted(event);
    const list = await event.sender.getPrintersAsync();
    return list.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: Boolean((p as { isDefault?: boolean }).isDefault),
      status: (p as { status?: string | number }).status
        ? String((p as { status?: string | number }).status)
        : undefined,
      description: (p as { description?: string }).description || undefined,
    }));
  });
  // Open OS printer settings / queue. Never submits a job from this handler.
  ipcMain.handle("print:open-queue", async (event) => {
    trusted(event);
    try {
      await shell.openExternal("ms-settings:printers");
      return "已打开系统打印机设置；打印队列请在对应打印机图标中查看。";
    } catch (e) {
      throw Error(
        "无法打开系统打印机设置：" +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  });
  ipcMain.handle("print:select", async (event) => {
    trusted(event);
    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender)!,
      {
        title: "选择要打印的文件",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "可打印", extensions: ["pdf", "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "docx"] },
          { name: "PDF", extensions: ["pdf"] },
          { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"] },
          { name: "Word", extensions: ["docx"] },
        ],
      },
    );
    if (result.canceled) return [];
    const files=[];
    for(const path of result.filePaths)files.push(await preparePreviewFile(path));
    if(event.sender.isDestroyed()){discardUnownedFiles(files);return [];}
    retainPreparedFiles(event.sender.id,files);
    return files;
  });
  const printable = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "docx"]);
  ipcMain.handle("print:submit", async (event, value: PdfPrintJob) => {
    trusted(event);
    const options = validatePrintOptions(value?.options);
    const owner = event.sender;
    const run = queue.then(async () => {
    if(owner.isDestroyed())throw Error('预览窗口已关闭。');
    const file = value?.file && await loadPreparedFile(value.file);
    if (
      !file ||
      !printable.has(file.ext) ||
      !(file.bytes instanceof Uint8Array) ||
      file.bytes.length > 100 * 1024 * 1024
    )
      throw Error("只支持有效的 PDF、图片或 DOCX 文件。");
    if (file.ext === "pdf" && new TextDecoder().decode(file.bytes.slice(0, 1024)).indexOf("%PDF-") < 0)
      throw Error("只支持有效的 PDF 文件。");
    const printers = await event.sender.getPrintersAsync();
    if (!printers.some((p) => p.name === options.deviceName))
      throw Error("打印机不可用，请重新选择。");
    return new Promise<PrintSubmitResult>((resolve, reject) => {
          if (owner.isDestroyed()) {
            reject(Error("预览窗口已关闭。"));
            return;
          }
          clearTimeout(idleTimer);
          const win = worker && !worker.isDestroyed() ? worker : new BrowserWindow({
            show: false,
            width: 1000,
            height: 800,
            webPreferences: {
              preload: path.join(__dirname, "preload.cjs"),
              session: local,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              backgroundThrottling: false,
            },
          });
          if (win !== worker) {
            worker = win;
            protectWindow(win);
            const workerId = win.webContents.id;
            win.on("closed", () => {
              if (worker === win) worker = undefined;
              if (jobs.has(workerId)) finish(workerId, Error("打印窗口已关闭。"));
            });
          }
          const id = win.webContents.id;
          const token=randomUUID();
          const abort = () =>
            finish(id, Error("预览窗口已关闭，停止准备打印。"),token);
          owner.once("destroyed", abort);
          const timer = setTimeout(
            () => finish(id, Error("打印准备超时，请减少页数后重试。"),token),
            180000,
          );
          preparedOptions.set(id, options);
          jobs.set(id, {
            owner: owner.id,
            token,
            job: { file, options, token },
            window: win,
            timer,
            resolve: (result) => {
              owner.removeListener("destroyed", abort);
              resolve(result);
            },
            reject: (e) => {
              owner.removeListener("destroyed", abort);
              reject(e);
            },
          });
          void win
            .loadURL("preview://local/index.html?print=1")
            .catch((e) => finish(id, e,token));
        });
    });
    queue = run.then(()=>{},()=>{});
    return await run;
  });
  ipcMain.handle("print:consume", (event) => {
    trusted(event);
    const entry = jobs.get(event.sender.id);
    if (!entry?.job) throw Error("打印任务已释放。");
    const job = entry.job;
    entry.consumed=true;
    entry.job = undefined;
    return job;
  });
  ipcMain.handle("print:ready", async (event, error?: string,token?:string) => {
    trusted(event);
    const entry = jobs.get(event.sender.id);
    if (!entry) return;
    if(!entry.consumed||token!==entry.token)return;
    if (entry.submitting) return;
    if (error) {
      finish(event.sender.id, Error(error),token);
      return;
    }
    // Options are retained separately in the print window's prepared payload.
    const options = preparedOptions.get(event.sender.id);
    if (!options) {
      finish(event.sender.id, Error("打印设置已释放。"),token);
      return;
    }
    entry.submitting = true;
    event.sender.print(
      {
        silent: true,
        deviceName: options.deviceName,
        copies: options.copies,
        pageSize: options.paper,
        landscape: options.landscape,
        color: options.color,
        duplexMode: options.duplex,
        printBackground: true,
        margins: { marginType: "none" },
      },
      (success, reason) => {
        if (jobs.get(event.sender.id) !== entry) return;
        const cancelled=/^(cancelled|canceled|print job cancel(?:led|ed))$/i.test(String(reason||'').trim());
        const result:PrintSubmitResult=success?{status:'submitted'}:cancelled?{status:'cancelled'}:{status:'failed',reason:String(reason||'未知驱动错误')};
        finish(event.sender.id,success?undefined:Error(reason||'打印提交未完成'),token,result);
      },
    );
  });
}
import type { PdfPrintOptions } from "@shared/printing";
const preparedOptions = new Map<number, PdfPrintOptions>();
function finish(id: number, error?: Error,token?:string,result?:PrintSubmitResult) {
  const entry = jobs.get(id);
  if (!entry) return;
  if(token&&entry.token!==token)return;
  jobs.delete(id);
  preparedOptions.delete(id);
  clearTimeout(entry.timer);
  if (error) {
    if (worker === entry.window) worker = undefined;
    if (!entry.window.isDestroyed()) entry.window.destroy();
  } else {
    // Reload the same hidden window for the next file; release it after batch idle.
    idleTimer = setTimeout(() => {
      if (worker === entry.window && !jobs.has(id)) {
        worker = undefined;
        if (!entry.window.isDestroyed()) entry.window.destroy();
      }
    }, 1500);
  }
  result ? entry.resolve(result) : error ? entry.reject(error) : entry.resolve({status:'submitted'});
}
