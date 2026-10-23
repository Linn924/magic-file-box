import type {PDFDocumentProxy,PDFPageProxy} from 'pdfjs-dist';
export interface PdfDestination {page:number;dest:unknown[];key?:string;title?:string;titleResolved?:boolean}
export interface PdfReadingPosition {page:number;x:number;y:number;viewport:ReturnType<PDFPageProxy['getViewport']>;destinationKey?:string}
export async function resolvePdfDestination(pdf:PDFDocumentProxy,value:unknown):Promise<PdfDestination|undefined>{
  const dest=typeof value==='string'?await pdf.getDestination(value):value;
  if(!Array.isArray(dest)||!dest.length)return;
  const page=typeof dest[0]==='number'?dest[0]+1:await pdf.getPageIndex(dest[0])+1;
  if(!Number.isInteger(page)||page<1||page>pdf.numPages)return;
  return {page,dest};
}
/** Convert PDF destinations using the actual crop box and intrinsic/user rotation. Keep the reader's zoom. */
export function destinationPoint(dest:unknown[],viewport:PdfReadingPosition['viewport']):number[]{
  const box=viewport.viewBox,type=(dest[1] as {name?:string})?.name;
  const number=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
  if(type==='XYZ')return viewport.convertToViewportPoint(number(dest[2],box[0]),number(dest[3],box[3]));
  if(type==='FitH'||type==='FitBH')return viewport.convertToViewportPoint(box[0],number(dest[2],box[3]));
  if(type==='FitV'||type==='FitBV')return viewport.convertToViewportPoint(number(dest[2],box[0]),box[3]);
  if(type==='FitR'){
    const a=viewport.convertToViewportPoint(number(dest[2],box[0]),number(dest[3],box[1]));
    const b=viewport.convertToViewportPoint(number(dest[4],box[2]),number(dest[5],box[3]));
    return [Math.min(a[0],b[0]),Math.min(a[1],b[1])];
  }
  return [0,0];
}
