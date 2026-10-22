import type ExcelJS from 'exceljs';
import type * as XLSX from 'xlsx';

export type PreviewCell = { style: Partial<ExcelJS.Style>; richText?: ExcelJS.RichText[] };
type Point = { col: number; row: number };
export type PreviewImage = { imageId: number; range: { tl: Point; br?: Point; ext?: { width: number; height: number } } };
export type PreviewSheet = {
  cells: Record<string, PreviewCell>;
  rows: Record<number, { height?: number; hidden?: boolean }>;
  columns: Record<number, { width?: number; hidden?: boolean }>;
  images: PreviewImage[];
};
export type WorkbookAppearance = {
  sheets: Record<string, PreviewSheet>;
  media: Record<number, { extension: string; buffer?: Uint8Array; base64?: string }>;
};
export type WorkbookPreview = { book: XLSX.WorkBook; appearance?: WorkbookAppearance; warning: string };
export type WorkbookReply =
  | { kind: 'book'; book: Omit<XLSX.WorkBook, 'Sheets'> & { SSF?: Record<string, string> }; styled: boolean }
  | { kind: 'sheet'; name: string; metadata: XLSX.WorkSheet; appearance?: Omit<PreviewSheet, 'cells'> }
  | { kind: 'cells'; name: string; cells: Array<[string, XLSX.CellObject]> }
  | { kind: 'styles'; name: string; cells: Array<[string, PreviewCell]> }
  | { kind: 'media'; id: number; media: WorkbookAppearance['media'][number] }
  | { kind: 'done'; warning: string }
  | { kind: 'error'; error: string };
export type WorkbookRequest = { kind: 'parse'; bytes: Uint8Array; ext: string } | { kind: 'ack' };

/** Serializable display data only: no ExcelJS classes or duplicate cell values in the UI. */
export function workbookAppearance(styled?: ExcelJS.Workbook): WorkbookAppearance | undefined {
  if (!styled) return;
  const result: WorkbookAppearance = { sheets: Object.create(null), media: Object.create(null) };
  styled.eachSheet(worksheet => {
    const sheet: PreviewSheet = { cells: Object.create(null), rows: Object.create(null), columns: Object.create(null), images: [] };
    result.sheets[worksheet.name] = sheet;
    // ExcelJS's public model includes styled blank cells as well as populated cells.
    const model = worksheet.model as ExcelJS.WorksheetModel & { rows: ExcelJS.RowModel[]; cols?: Array<{ min: number; max: number; width?: number; hidden?: boolean }> };
    // Hidden empty rows can be omitted by ExcelJS's row.model getter.
    for (let index = 1; index <= worksheet.rowCount; index++) {
      const row = worksheet.findRow(index);
      if (row && (row.height !== undefined || row.hidden)) sheet.rows[index] = { height: row.height, hidden: row.hidden };
    }
    for (const row of model.rows) {
      for (const cell of row.cells) {
        const value = cell.value;
        const richText = value && typeof value === 'object' && 'richText' in value ? value.richText : undefined;
        if (Object.keys(cell.style ?? {}).length || richText) sheet.cells[String(cell.address)] = { style: cell.style ?? {}, richText };
      }
    }
    for (const col of model.cols ?? []) for (let index = col.min; index <= col.max; index++) {
      sheet.columns[index] = { width: col.width, hidden: col.hidden };
    }
    for (const image of worksheet.getImages()) {
      const range = image.range;
      if (!range?.tl) continue;
      const imageId = Number(image.imageId);
      sheet.images.push({ imageId, range: {
        tl: { col: range.tl.col, row: range.tl.row },
        br: range.br ? { col: range.br.col, row: range.br.row } : undefined,
        ext: 'ext' in range ? range.ext as { width: number; height: number } : undefined,
      } });
      if (!result.media[imageId]) {
        const media = styled.getImage(imageId);
        if (media) result.media[imageId] = { extension: media.extension,
          buffer: media.buffer ? new Uint8Array(media.buffer) : undefined, base64: media.base64 };
      }
    }
  });
  return result;
}
