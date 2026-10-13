export type ExcelCopyFormat='xlsx'|'xls'|'csv'|'tsv';
export type ExcelValue={kind:'text';value:string}|{kind:'number';value:number}|{kind:'formula';value:string}|{kind:'blank'};
export type ExcelAlignment='left'|'center'|'right';
export interface ExcelSelection {sheet:string;anchor:{r:number;c:number};focus:{r:number;c:number};mode:'cells'|'rows'|'columns'|'all'}
export interface ExcelChange {sheet:string;address:string;value:ExcelValue;alignment?:ExcelAlignment;alignmentOnly?:boolean}
export interface ExcelBefore {sheet:string;address:string;value:ExcelValue|null;alignment?:ExcelAlignment;alignmentOnly?:boolean}
export interface ExcelGridState {bytes?:Uint8Array;changes:ExcelChange[];revisions:Record<string,number>;address:string;widths?:Record<string,number>;formatted?:string[];selection?:ExcelSelection}
export interface ExcelTransaction {before:ExcelBefore[];after:ExcelChange[];grid?:{before:ExcelGridState;after:ExcelGridState}}
export interface ExcelDraft {editing:boolean;changes:ExcelChange[];undo:ExcelTransaction[];redo:ExcelTransaction[];savedSignature:string;sheet:string;address:string;input:string;baseBytes?:Uint8Array;revisions?:Record<string,number>;serial?:number;formatted?:string[];selection?:ExcelSelection}
export interface ExcelStructure {sheet:string;axis:'row'|'column';kind:'insert'|'delete';index:number;count:number}
export interface ExcelRegionClipboard {file:string;sheet:string;range:{s:{r:number;c:number};e:{r:number;c:number}};cells:Array<{r:number;c:number;xml:string;valueXml?:string;valueError?:string}>;merges:Array<{s:{r:number;c:number};e:{r:number;c:number}}>;styles:string;theme?:string;date1904?:boolean;text:string;cut:boolean;signature:string}
export type ExcelPasteMode='all'|'values'|'formulas'|'formats';
