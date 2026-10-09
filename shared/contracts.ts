export interface PreviewFile {
  id: string;
  name: string;
  size: number;
  ext: string;
  bytes: Uint8Array;
  error: string;
  view?: {
    zoom: number;
    scroll: Array<{ top: number; left: number }>;
    fit?: "original" | "width" | "page";
    encoding?: string;
    /** PDF temporary rotation in degrees; does not modify the source file. */
    rotate?: 0 | 90 | 180 | 270;
    /** Session-only unlock state; never included in application settings. */
    pdfPassword?: string;
    pdfPrintAllowed?: boolean;
    /** PDF marks exist only in the active in-memory preview session. */
    pdfNotes?: PdfTemporaryMark[];
    /** Session-only physical page and row progress; survives automatic regrouping. */
    pdfReading?: {page:number;fraction:number};
    image?: {rotate:0|90|180|270;originalPixels:boolean};
    excel?: {
      sheet: string;
      columns: number;
      rows: number;
      widths: Record<string, number>;
    };
    /** Word temporary table column widths: `tableIndex:colIndex` → px. */
    word?: { widths: Record<string, number> };
  };
}
export interface PdfTemporaryMark {
  id:string;
  page:number;
  quote:string;
  content:string;
  kind:'highlight'|'note';
  rotation:0|90|180|270;
  rects:Array<{x:number;y:number;width:number;height:number}>;
}
export type Theme = "light" | "dark" | "system";
export type PrintEntry = "all" | "current" | "none";
export interface Settings {
  theme: Theme;
  closeAction: "ask" | "quit" | "tray";
  multiFileMode: "ask" | "tabs" | "windows";
  defaultZoom: number;
  maximizePreview: boolean;
  printEntry: PrintEntry;
}
export const defaults: Settings = {
  theme: "light",
  closeAction: "ask",
  multiFileMode: "ask",
  defaultZoom: 100,
  maximizePreview: true,
  printEntry: "all",
};
export const extensions = [
  "docx",
  "doc",
  "txt",
  "text",
  "json",
  "md",
  "log",
  "xml",
  "js",
  "ts",
  "css",
  "ini",
  "yaml",
  "yml",
  "toml",
  "xlsx",
  "xls",
  "csv",
  "tsv",
  "pptx",
  "ppt",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
];
export function normalizeSettings(
  input: Partial<Settings> = {},
  base: Settings = defaults,
): Settings {
  return {
    theme: ["light", "dark", "system"].includes(input.theme ?? "")
      ? input.theme!
      : base.theme,
    closeAction: ["ask", "quit", "tray"].includes(input.closeAction ?? "")
      ? input.closeAction!
      : base.closeAction,
    multiFileMode: ["ask", "tabs", "windows"].includes(
      input.multiFileMode ?? "",
    )
      ? input.multiFileMode!
      : base.multiFileMode,
    defaultZoom: Number.isFinite(input.defaultZoom)
      ? Math.min(400, Math.max(25, Math.round(input.defaultZoom!)))
      : base.defaultZoom,
    maximizePreview:
      typeof input.maximizePreview === "boolean"
        ? input.maximizePreview
        : base.maximizePreview,
    printEntry: ["all", "current", "none"].includes(input.printEntry ?? "")
      ? input.printEntry!
      : base.printEntry,
  };
}
export interface DesktopBridge {
  exportPdfNotes(id:string,name:string,data:Uint8Array):Promise<'saved'|'cancelled'>;
  pdfResources(): Promise<{pixels:number;bytes:number;documents:number}>;
  releasePdfResources(): void;
  onPdfResources(handler:(budget:{pixels:number;bytes:number;documents:number})=>void):()=>void;
  loadPreview(file:PreviewFile):Promise<PreviewFile>;
  setPdfPassword(id:string,password:string):Promise<void>;
  openExternal(url: string): Promise<void>;
  openPrintPanel(files:PreviewFile[]):Promise<void>;
  printPanelFiles():Promise<PreviewFile[]>;
  onPrintIncoming(handler:()=>void):()=>void;
  previewPrintFile(file:PreviewFile):Promise<void>;
  onPreviewPrintFile(handler:(file:PreviewFile)=>void):()=>void;
  arrangePrintWindows():Promise<void>;
  printPanelBusy(value:boolean):void;
  printers(): Promise<import("./printing").Printer[]>;
  openPrintQueue(): Promise<string>;
  dropPrintPdfs(files:File[]):Promise<PreviewFile[]>;
  selectPrintPdfs(): Promise<PreviewFile[]>;
  printPdf(job: import("./printing").PdfPrintJob): Promise<import("./printing").PrintSubmitResult>;
  consumePrint(): Promise<import("./printing").PdfPrintJob>;
  printReady(error?: string, token?: string): Promise<void>;
  setFullscreen(value: boolean): Promise<boolean>;
  onFullscreen(handler: (value: boolean) => void): () => void;
  claim(id: string): Promise<PreviewFile>;
  accept(id: string): Promise<void>;
  release(id: string): void;
  supply(file: PreviewFile): void;
  onExport(handler: (id: string) => void): () => void;
  onRemove(handler: (id: string) => void): () => void;
  select(): Promise<void>;
  /** Open dialog and append selected files as tabs in the current preview window. */
  addPreviewFiles(): Promise<PreviewFile[]>;
  drop(files: File[]): Promise<void>;
  consume(): Promise<PreviewFile[]>;
  close(): void;
  getSettings(): Promise<Settings>;
  setSettings(settings: Partial<Settings>): Promise<Settings>;
  onSettings(handler: (settings: Settings) => void): () => void;
}
