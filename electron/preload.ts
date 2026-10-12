import { contextBridge, ipcRenderer, shell, webUtils } from "electron";
import type { DesktopBridge, Settings } from "../shared/contracts";

const bridge: DesktopBridge = {
  followMarkdownLink:(id,href)=>ipcRenderer.invoke('markdown:follow',id,href),
  markdownImage:(id,href)=>ipcRenderer.invoke('markdown:image',id,href),
  markdownCopy:(id,text)=>ipcRenderer.invoke('markdown:copy',id,text),
  onPreviewIncoming:handler=>{const listener=(_event:Electron.IpcRendererEvent,file:import('../shared/contracts').PreviewFile)=>handler(file);ipcRenderer.on('preview:incoming',listener);return ()=>ipcRenderer.removeListener('preview:incoming',listener);},
  markModified:(id,dirty)=>ipcRenderer.invoke('preview:modified',id,dirty),
  confirmDiscard:(id,force)=>ipcRenderer.invoke('preview:confirm-discard',id,force),
  saveExcelCopy:(id,format,data)=>ipcRenderer.invoke('excel:save-copy',id,format,data),
  excelClipboard:(id,operation,text)=>ipcRenderer.invoke('excel:clipboard',id,operation,text),
  exportPdfNotes:(id,name,data)=>ipcRenderer.invoke('pdf:export-notes',id,name,data),
  pdfResources:()=>ipcRenderer.invoke('pdf:resources'),
  releasePdfResources:()=>ipcRenderer.send('pdf:resources-release'),
  onPdfResources:handler=>{
    const listener=(_event:Electron.IpcRendererEvent,value:{pixels:number;bytes:number;documents:number})=>handler(value);
    ipcRenderer.on('pdf:resources',listener);
    return ()=>ipcRenderer.removeListener('pdf:resources',listener);
  },
  loadPreview: (file) => ipcRenderer.invoke("preview:load", file),
  setPdfPassword:(id,password)=>ipcRenderer.invoke('pdf:password',id,password),
  openExternal: async (url: string) => {
    if (!/^https?:\/\//i.test(url)) throw Error("仅允许打开 http(s) 链接。");
    await shell.openExternal(url);
  },
  openPrintPanel: (files) => ipcRenderer.invoke("print:open-panel", files),
  printPanelFiles: () => ipcRenderer.invoke("print:panel-files"),
  onPrintIncoming: (handler) => {
    ipcRenderer.on("print:incoming", handler);
    return () => ipcRenderer.removeListener("print:incoming", handler);
  },
  previewPrintFile: (file) => ipcRenderer.invoke("print:preview-file", file),
  onPreviewPrintFile: (handler) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      file: import("../shared/contracts").PreviewFile,
    ) => handler(file);
    ipcRenderer.on("print:preview-file", listener);
    return () => ipcRenderer.removeListener("print:preview-file", listener);
  },
  arrangePrintWindows: () => ipcRenderer.invoke("print:arrange"),
  printPanelBusy: (value) => ipcRenderer.send("print:panel-busy", value),
  dropPrintPdfs: (files) =>
    ipcRenderer.invoke(
      "print:drop",
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  printers: () => ipcRenderer.invoke("print:printers"),
  openPrintQueue: () => ipcRenderer.invoke("print:open-queue"),
  selectPrintPdfs: () => ipcRenderer.invoke("print:select"),
  printPdf: (job) => ipcRenderer.invoke("print:submit", job),
  consumePrint: () => ipcRenderer.invoke("print:consume"),
  printReady: (error,token) => ipcRenderer.invoke("print:ready", error,token),
  setFullscreen: (value) => ipcRenderer.invoke("window:fullscreen", value),
  onFullscreen: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, value: boolean) =>
      handler(value);
    ipcRenderer.on("window:fullscreen", listener);
    return () => ipcRenderer.removeListener("window:fullscreen", listener);
  },
  claim: (id) => ipcRenderer.invoke("tabs:claim", id),
  accept: (id) => ipcRenderer.invoke("tabs:accept", id),
  release: (id) => ipcRenderer.send("tabs:release", id),
  supply: (file) => ipcRenderer.send("tabs:supply", file),
  onExport: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string) =>
      handler(id);
    ipcRenderer.on("tabs:export", listener);
    return () => ipcRenderer.removeListener("tabs:export", listener);
  },
  onRemove: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string) =>
      handler(id);
    ipcRenderer.on("tabs:remove", listener);
    return () => ipcRenderer.removeListener("tabs:remove", listener);
  },
  select: () => ipcRenderer.invoke("preview:select"),
  addPreviewFiles: () => ipcRenderer.invoke("preview:add"),
  drop: (files) =>
    ipcRenderer.invoke(
      "preview:drop",
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  consume: () => ipcRenderer.invoke("preview:consume"),
  close: () => ipcRenderer.send("preview:close"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (settings) => ipcRenderer.invoke("settings:set", settings),
  onSettings: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: Settings) =>
      handler(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },
};

contextBridge.exposeInMainWorld("localPreview", bridge);
