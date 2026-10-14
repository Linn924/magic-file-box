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
    excelDraft?: import("./excelEditing").ExcelDraft;
    markdownAnchor?:string;
    markdown?:{source:boolean;outline:boolean};
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
