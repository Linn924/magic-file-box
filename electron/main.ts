import {setupModifiedFiles,hasModified,confirmModified,forgetModified} from './modifiedFiles';
import {setupExcelCopy} from './excelCopy';
import {setupMarkdownLinks} from './markdownLinks';
import {setupPrintWindow} from "./printing/window";
import { setupPdfExport } from './pdfExport';
import { setupPrinting } from "./printing";
import { setupPdfResources,pdfResourceStats } from './pdfResources';
import { setupFullscreen, trackFullscreen } from "./fullscreen";
import { registerFiles, releaseWindow, setupTransfers } from "./transfers";
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  Tray,
  nativeImage,
  type Session,
} from "electron";
import path from "node:path";
import { SettingsStore } from "./settings";
import { preparePreviewFile, loadPreparedFile, fileArguments, preparedFileCount,rememberPdfPassword } from "./files";
import { createLocalSession, protectWindow, trusted } from "./security";
import {
  extensions,
  type PreviewFile,
  type Settings,
} from "../shared/contracts";

// Honor an explicit profile location (also used by packaged integration tests).
export function previewResourceStats(){return {paths:preparedFileCount(),pdfWindows:pdfResourceStats().clients};}
const profile = app.commandLine.getSwitchValue("user-data-dir");
if (profile && path.isAbsolute(profile)) app.setPath("userData", profile);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "preview",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
for (const flag of [
  "disable-http-cache",
  "disable-gpu-shader-disk-cache",
  "disable-background-networking",
  "disable-breakpad",
])
  app.commandLine.appendSwitch(flag);
export const payloads = new Map<number, PreviewFile[]>();
let local: Session;
export let settings: SettingsStore;
let tray: Tray | undefined;
let home: BrowserWindow | undefined;
let quitting = false;
let closePrompt = false;
let openQueue: Promise<unknown> = Promise.resolve();
const icon = path.join(__dirname, "../assets/logo.png");
const forceClose = new Set<number>();

function broadcast(value: Settings) {
  for (const win of BrowserWindow.getAllWindows())
    win.webContents.send("settings:changed", value);
}
export function updateSettings(value: Partial<Settings>) {
  const next = settings.update(value);
  broadcast(next);
  return next;
}
function showWindows() {
  const windows = BrowserWindow.getAllWindows();
  if (!windows.length) void createHome();
  for (const win of windows) {
    if (win.isMinimized()) win.restore();
    win.show();
  }
  windows.at(-1)?.focus();
}
function hideToTray() {
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(icon));
    tray.setToolTip("File Preview");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示窗口", click: showWindows },
        {
          label: "退出软件",
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("double-click", showWindows);
    tray.on("click", showWindows);
  }
  for (const win of BrowserWindow.getAllWindows()) win.hide();
}
async function requestClose(win: BrowserWindow) {
  if (closePrompt) return;
  closePrompt = true;
  try {
    let action = settings.get().closeAction;
    if (action === "ask") {
      const result = await dialog.showMessageBox(win, {
        type: "question",
        title: "关闭文件预览",
        message: "这次想怎样关闭？",
        detail: "退出会关闭所有预览。隐藏后可点击右下角托盘图标继续查看。",
        buttons: ["退出软件", "隐藏到托盘", "取消"],
        defaultId: 1,
        cancelId: 2,
        checkboxLabel: "记住我的选择，以后可在设置中修改",
        checkboxChecked: true,
      });
      if (result.response === 2) return;
      action = result.response === 0 ? "quit" : "tray";
      if (result.checkboxChecked) updateSettings({ closeAction: action });
    }
    if (action === "quit") {
      quitting = true;
      app.quit();
    } else hideToTray();
  } finally {
    closePrompt = false;
  }
}
function createWindow(preview: boolean) {
  const win = new BrowserWindow({
    width: preview ? 1200 : 960,
    height: preview ? 850 : 700,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "文件预览",
    icon,
    backgroundColor: settings.get().theme === "dark" ? "#151b25" : "#f5f6f8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      session: local,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const id = win.webContents.id;
  protectWindow(win);
  if (preview) trackFullscreen(win);
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      if (preview && settings.get().maximizePreview) win.maximize();
      win.show();
    }
  });
  win.on("close", (event) => {
    if(preview&&!quitting&&!forceClose.has(win.id)&&hasModified(id)){
      if(!confirmModified(win,id)){event.preventDefault();return;}
      forgetModified(id);
    }
    if (!preview && !quitting && !forceClose.has(win.id)) {
      event.preventDefault();
      void requestClose(win);
    }
  });
  win.on("closed", () => {
    payloads.delete(id);
    releaseWindow(id);
    forceClose.delete(win.id);
  });
  return win;
}
async function createHome() {
  home = createWindow(false);
  await home.loadURL("preview://local/index.html");
  return home;
}
export async function openPaths(paths: string[], mode?: "tabs" | "windows",view?:PreviewFile['view']) {
  if (!paths.length) return [];
  if (!mode) {
    const preference = settings.get().multiFileMode;
    if (paths.length > 1 && preference === "ask") {
      const result = await dialog.showMessageBox({
        type: "question",
        title: "打开多个文件",
        message: "这些文件想怎样查看？",
        detail:
          "标签页：放在一个窗口里切换。独立窗口：每个文件各开一个窗口。以后可在设置中修改。",
        buttons: ["一个窗口，标签切换", "每个文件一个窗口", "取消"],
        defaultId: 0,
        cancelId: 2,
      });
      if (result.response === 2) return [];
      mode = result.response === 0 ? "tabs" : "windows";
      updateSettings({ multiFileMode: mode });
    } else mode = preference === "tabs" ? "tabs" : "windows";
  }
  const groups = mode === "tabs" ? [paths] : paths.map((p) => [p]);
  const created: BrowserWindow[] = [];
  for (const group of groups) {
    const files: PreviewFile[] = [];
    for (const name of group){const file=await preparePreviewFile(name);if(view)file.view=view;files.push(file);}
    const win = createWindow(true);
    registerFiles(win.webContents.id, files);
    payloads.set(win.webContents.id, files);
    try { await win.loadURL("preview://local/index.html?preview=1"); }
    catch(error) { if(!win.isDestroyed())win.destroy();throw error; }
    created.push(win);
  }
  return created;
}
export const openPath = (file: string) =>
  openPaths([file], "windows").then((w) => w[0]);
function enqueue(paths: string[]) {
  const task = openQueue.then(() => openPaths(paths));
  openQueue = task.catch(() => {});
  return task;
}
export function closePreview(win: BrowserWindow) {
  forceClose.add(win.id);
  win.close();
}

const owner = app.requestSingleInstanceLock();
if (!owner) app.quit();
app.on("second-instance", (_event, args) => {
  void ready.then(() => {
    const files = fileArguments(args);
    if (files.length)
      void enqueue(files).catch((e) =>
        dialog.showErrorBox("无法打开", String(e)),
      );
    else showWindows();
  });
});
app.on("open-file", (event, file) => {
  event.preventDefault();
  void ready
    .then(() => enqueue([file]))
    .catch((e) => dialog.showErrorBox("无法打开", String(e)));
});
export const ready = owner
  ? app.whenReady().then(async () => {
      settings = new SettingsStore(
        path.join(app.getPath("userData"), "preferences.json"),
      );
      Menu.setApplicationMenu(null);
      setupTransfers();
      setupModifiedFiles();setupExcelCopy();
      setupMarkdownLinks(async(target,anchor)=>{await openPaths([target],'windows',anchor?{zoom:100,scroll:[],markdownAnchor:anchor}:undefined);});
      setupFullscreen();
      local = await createLocalSession(path.resolve(__dirname, "../dist"));
      setupPrinting(local);
      setupPdfExport();
      setupPdfResources();
      setupPrintWindow(local, async (files) => {
        const win = createWindow(true);
        registerFiles(win.webContents.id, files);
        payloads.set(win.webContents.id, files);
        try { await win.loadURL("preview://local/index.html?preview=1"); }
        catch(error) { if(!win.isDestroyed())win.destroy();throw error; }
        return win;
      });
      ipcMain.handle("preview:select", async (event) => {
        trusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        const options: Electron.OpenDialogOptions = {
          title: "选择文件",
          properties: ["openFile", "multiSelections"],
          filters: [
            { name: "支持的文件", extensions },
            { name: "所有文件", extensions: ["*"] },
          ],
        };
        const result = await (win
          ? dialog.showOpenDialog(win, options)
          : dialog.showOpenDialog(options));
        if (!result.canceled) await enqueue(result.filePaths);
      });
      ipcMain.handle("preview:add", async (event) => {
        trusted(event);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || !event.sender.getURL().includes("?preview=1"))
          throw Error("请在预览窗口中添加文件。");
        const result = await dialog.showOpenDialog(win, {
          title: "打开文件",
          properties: ["openFile", "multiSelections"],
          filters: [
            { name: "支持的文件", extensions },
            { name: "所有文件", extensions: ["*"] },
          ],
        });
        if (result.canceled || !result.filePaths.length) return [];
        const files: PreviewFile[] = [];
        for (const name of result.filePaths)
          files.push(await preparePreviewFile(name));
        registerFiles(event.sender.id, files);
        return files;
      });
      ipcMain.handle("preview:drop", async (event, paths: unknown) => {
        trusted(event);
        if (
          !Array.isArray(paths) ||
          paths.some((p) => typeof p !== "string" || !path.isAbsolute(p))
        )
          throw new Error("请选择有效的本机文件。");
        await enqueue(paths);
      });
      ipcMain.handle("preview:consume", (event) => {
        trusted(event);
        const value = payloads.get(event.sender.id) || [];
        registerFiles(event.sender.id, value);
        payloads.delete(event.sender.id);
        return value;
      });
      ipcMain.handle('preview:load',async(event,file:PreviewFile)=>{trusted(event);return loadPreparedFile(file);});
      ipcMain.handle('pdf:password',(event,id:string,password:string)=>{trusted(event);rememberPdfPassword(event.sender.id,id,password);});
      ipcMain.on("preview:close", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
      });
      ipcMain.handle("settings:get", (event) => {
        trusted(event);
        return settings.get();
      });
      ipcMain.handle("settings:set", (event, value: Partial<Settings>) => {
        trusted(event);
        return updateSettings(value && typeof value === "object" ? value : {});
      });
      const root = await createHome();
      const args = fileArguments(process.argv.slice(app.isPackaged ? 1 : 2));
      if (args.length) await enqueue(args);
      return root;
    })
  : Promise.resolve(undefined);
app.on("before-quit", (event) => {
  if(hasModified()){
    const win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());
    if(win&&!confirmModified(win)){event.preventDefault();quitting=false;return;}
    for(const window of BrowserWindow.getAllWindows())forgetModified(window.webContents.id);
  }
  quitting = true;
});
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
app.on("will-quit", () => {
  tray?.destroy();
  payloads.clear();
});
