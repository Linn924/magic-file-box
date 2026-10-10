export type ExcelCopyFormat='xlsx'|'csv'|'tsv';
export type ExcelValue={kind:'text';value:string}|{kind:'number';value:number}|{kind:'formula';value:string}|{kind:'blank'};
export interface ExcelChange {sheet:string;address:string;value:ExcelValue}
export interface ExcelBefore {sheet:string;address:string;value:ExcelValue|null}
export interface ExcelTransaction {before:ExcelBefore[];after:ExcelChange[]}
export interface ExcelDraft {editing:boolean;changes:ExcelChange[];undo:ExcelTransaction[];redo:ExcelTransaction[];savedSignature:string;sheet:string;address:string;input:string}
