import { contentBoxMm,printScaleFactor,type PrintScale } from '@shared/printing';
/** Render only the printable crop; actual-size pages are never CSS-shrunk. */
export function pdfRasterPlan(original:{width:number;height:number},paper:{width:number;height:number},mode:PrintScale,dpi:number) {
  const factor=printScaleFactor(original,paper,mode);
  const scale=factor*dpi/72;
  const fullWidth=original.width*scale,fullHeight=original.height*scale;
  const box=contentBoxMm(paper);
  const width=Math.max(1,Math.min(Math.ceil(fullWidth),Math.floor(box.width*dpi/25.4)));
  const height=Math.max(1,Math.min(Math.ceil(fullHeight),Math.floor(box.height*dpi/25.4)));
  return {scale,width,height,transform:[1,0,0,1,Math.min(0,(width-fullWidth)/2),Math.min(0,(height-fullHeight)/2)],widthMm:width*25.4/dpi,heightMm:height*25.4/dpi};
}
