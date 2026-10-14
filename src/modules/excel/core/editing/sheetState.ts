import type {WorkBook} from 'xlsx';
export function visibleSheetNames(book?:WorkBook){return book?.SheetNames.filter((_,i)=>!book.Workbook?.Sheets?.[i]?.Hidden)||[];}
