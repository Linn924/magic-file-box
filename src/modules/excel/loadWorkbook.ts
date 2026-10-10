import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {readXlsAlignments} from './xlsCopy';
export function readBasicWorkbook(bytes:Uint8Array,ext:string){
  if(ext==='csv'||ext==='tsv'){
    let text:string;
    if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le',{fatal:true}).decode(bytes);
    else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes);
    else {try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('gb18030',{fatal:true}).decode(bytes);}}
    return XLSX.read(text,{type:'string',raw:true,FS:ext==='tsv'?'\t':undefined,cellStyles:true,cellText:true,cellHTML:false,sheetStubs:true});
  }
  const book=XLSX.read(bytes,{type:'array',cellStyles:true,cellNF:true,cellText:true,cellHTML:false,sheetStubs:true});
  if(ext==='xls')readXlsAlignments(bytes,book);return book;
}
export async function loadWorkbook(bytes: Uint8Array, ext: string) {
  // Basic cell data remains available when the optional style engine rejects a file.
  const book=readBasicWorkbook(bytes,ext);
  let styled: ExcelJS.Workbook | undefined;
  let warning = '';
  if (ext === 'xlsx') {
    try {
      styled = new ExcelJS.Workbook();
      await styled.xlsx.load(bytes.slice().buffer);
    } catch {
      styled = undefined;
      warning = '部分样式或图片无法还原，已使用基础表格预览；单元格数据仍可查看。';
    }
  }
  return { book, styled, warning };
}
