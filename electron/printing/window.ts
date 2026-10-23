import { BrowserWindow, ipcMain, screen, dialog, app, type Session } from "electron";
import path from "node:path";
import { trusted, protectWindow } from "../security";
import { registerFiles } from "../files/transfers";
import type { PreviewFile } from "@shared/contracts";
import { retainPreparedFiles, releasePreparedOwner } from '../files';
export function setupPrintWindow(
  local: Session,
  openPreview: (files: PreviewFile[]) => Promise<BrowserWindow>,
) {
  let quitting=false;app.on("before-quit",()=>{quitting=true;});
  let panel: BrowserWindow | undefined,
    preview: BrowserWindow | undefined,
    loading: Promise<void> | undefined;
  const watchedPreviews=new WeakSet<BrowserWindow>();
  function followPreview(win:BrowserWindow|undefined){
    preview=win;
    if(!win||watchedPreviews.has(win))return;
    watchedPreviews.add(win);
    win.on('close',event=>{if(!event.defaultPrevented&&preview===win)preview=undefined;});
    win.on('closed',()=>{if(preview===win)preview=undefined;});
  }
  const incoming: PreviewFile[] = [];
  let busy = false;
  ipcMain.handle("print:open-panel", async (event, files: PreviewFile[]) => {
    trusted(event);
    followPreview(BrowserWindow.fromWebContents(event.sender) || undefined);
    const list = Array.isArray(files) ? files : [];
    const printable = new Set([
      "pdf",
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "bmp",
      "svg",
      "docx",
    ]);
    for (const file of list)
      if (file?.ext && printable.has(file.ext) && file?.id) incoming.push(file);
    if (!panel || panel.isDestroyed()) {
      busy = false;
      const area = screen.getDisplayMatching(
        preview?.getBounds() || { x: 0, y: 0, width: 1, height: 1 },
      ).workArea;
      const width = Math.min(760, area.width),
        height = Math.min(880, area.height);
      panel = new BrowserWindow({
        title: "PDF 打印设置",
        width,
        height,
        minWidth: 520,
        minHeight: 450,
        x: area.x + area.width - width,
        y: area.y,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          session: local,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      protectWindow(panel);
      const panelId=panel.webContents.id;
      panel.on("close", (e) => {
        if (busy && !quitting) {
          e.preventDefault();
          void dialog.showMessageBox(panel!, {
            message:
              "正在准备或提交打印。请先停止后续任务，等待当前任务结束后再关闭。",
            buttons: ["知道了"],
          });
        }
      });
      panel.on("closed", () => {
        releasePreparedOwner(panelId);
        panel = undefined;
        incoming.length = 0;
        busy = false;
      });
      loading = panel
        .loadURL("preview://local/index.html?print-panel=1")
        .then(() => {}).catch(error=>{if(panel&&!panel.isDestroyed())panel.destroy();throw error;});
      await loading;
      panel.show();
    } else {
      await loading;
      panel.webContents.send("print:incoming");
      panel.show();
      panel.focus();
    }
    if(panel&&!panel.isDestroyed())retainPreparedFiles(panel.webContents.id,list);
  });
  ipcMain.handle("print:panel-files", (event) => {
    trusted(event);
    if (event.sender.id !== panel?.webContents.id)
      throw Error("无效打印窗口。");
    return incoming.splice(0);
  });
  ipcMain.on("print:panel-busy", (event, value: boolean) => {
    if (event.sender.id === panel?.webContents.id) busy = value === true;
  });
  ipcMain.handle("print:preview-file", async (event, file: PreviewFile) => {
    trusted(event);
    const printable = new Set([
      "pdf",
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "bmp",
      "svg",
      "docx",
    ]);
    if (event.sender.id !== panel?.webContents.id || !file?.ext || !printable.has(file.ext))
      throw Error("无效打印预览。");
    if (preview && !preview.isDestroyed()) {
      registerFiles(preview.webContents.id, [file]);
      preview.webContents.send("print:preview-file", file);
      preview.showInactive();
    } else followPreview(await openPreview([file]));
  });
  ipcMain.handle("print:arrange", async (event) => {
    trusted(event);
    if (
      event.sender.id !== panel?.webContents.id ||
      !preview ||
      preview.isDestroyed()
    )
      return;
    const area = screen.getDisplayMatching(panel.getBounds()).workArea;
    const targetPreview=preview,targetPanel=panel;
    async function normalize(win:BrowserWindow){
      async function transition(event:"leave-full-screen"|"unmaximize",action:()=>void){await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);if(event==="leave-full-screen")win.removeListener("leave-full-screen",done);else win.removeListener("unmaximize",done);resolve();};const timer=setTimeout(done,600);if(event==="leave-full-screen")win.once("leave-full-screen",done);else win.once("unmaximize",done);action();});}
      if(win.isFullScreen())await transition('leave-full-screen',()=>win.setFullScreen(false));
      if(win.isMaximized())await transition('unmaximize',()=>win.unmaximize());
      if(win.isMinimized())win.restore();
    }
    await Promise.all([normalize(targetPreview),normalize(targetPanel)]);
    if(targetPreview.isDestroyed()||targetPanel.isDestroyed()||preview!==targetPreview||panel!==targetPanel)return;
    preview=targetPreview;panel=targetPanel;
    const right = Math.max(520,Math.min(700,area.width-720));
    preview.setMinimumSize(Math.min(720,area.width-right),450);
    preview.setBounds({
      x: area.x,
      y: area.y,
      width: area.width - right,
      height: area.height,
    });
    panel.setBounds({
      x: area.x + area.width - right,
      y: area.y,
      width: right,
      height: area.height,
    });
    preview.showInactive();
    panel.show();
  });
  return ()=>busy;
}
