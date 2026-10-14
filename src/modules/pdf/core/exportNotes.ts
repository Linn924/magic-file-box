import type {PDFDocumentProxy,RenderTask} from 'pdfjs-dist';
import type {PdfTemporaryMark} from '@shared/contracts';
import {allocatePdfCanvas,availablePdfPixels,releasePdfCanvas} from './canvasPool';
import {rotateNoteRect} from './annotationGeometry';
import {previewPixelRatio} from './bitmap';
export async function exportAnnotatedPage(doc:PDFDocumentProxy,pageNumber:number,rotation:PdfTemporaryMark['rotation'],notes:PdfTemporaryMark[],signal:AbortSignal) {
  const canvas=document.createElement('canvas');let task:RenderTask|undefined;
  const cancel=()=>task?.cancel();signal.addEventListener('abort',cancel,{once:true});
  try {
    const page=await doc.getPage(pageNumber);if(signal.aborted)throw new DOMException('已取消','AbortError');
    const base=page.getViewport({scale:1,rotation:(page.rotate+rotation)%360});
    const ratio=previewPixelRatio(base.width,base.height,Math.min(2,1200/base.width),Math.min(6000000,availablePdfPixels()));
    const viewport=page.getViewport({scale:ratio,rotation:(page.rotate+rotation)%360});
    // Notes are a separate margin; never paint over the source text with note bodies.
    const width=Math.max(1,Math.floor(viewport.width)),height=Math.max(1,Math.floor(viewport.height));
    const margin=notes.some(note=>note.kind==='note')?340:0;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建导出画布。');
    ctx.font='14px sans-serif';
    const rows:Array<{title:string;lines:string[]}>=[];
    for(const note of notes.filter(note=>note.kind==='note')){
      const lines:string[]=[];
      for(const paragraph of (note.quote+'\n'+(note.content||'（未填写备注）')).split('\n')){
        let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>margin-32){lines.push(line);line='';}line+=char;}lines.push(line);
      }
      rows.push({title:'备注 '+(rows.length+1),lines});
    }
    const outputHeight=Math.max(height,rows.reduce((sum,row)=>sum+36+row.lines.length*20,24));
    if(width+margin>8192||outputHeight>8192||(width+margin)*outputHeight>6000000||!allocatePdfCanvas(canvas,width+margin,outputHeight,true))throw Error('当前页批注过长或导出资源不足，请减少备注后重试。');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    task=page.render({canvas,canvasContext:ctx,viewport});await task.promise;
    if(signal.aborted)throw new DOMException('已取消','AbortError');
    // PDF.js may fill only the page viewport; restore the notes margin background.
    if(margin){ctx.fillStyle='#f5f5f5';ctx.fillRect(width,0,margin,canvas.height);}
    for(const note of notes)for(const rect of note.rects){const r=rotateNoteRect(rect,note.rotation,rotation);ctx.fillStyle=note.kind==='highlight'?'rgba(255,210,0,.35)':'rgba(74,144,226,.25)';ctx.fillRect(r.x*width,r.y*height,r.width*width,r.height*height);}
    let y=24;ctx.textBaseline='top';ctx.font='14px sans-serif';
    for(const row of rows){ctx.fillStyle='#1d4ed8';ctx.fillText(row.title,width+16,y);y+=24;ctx.fillStyle='#222';for(const line of row.lines){ctx.fillText(line,width+16,y);y+=20;}y+=12;}
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG 编码失败。')),'image/png'));
    if(signal.aborted)throw new DOMException('已取消','AbortError');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {signal.removeEventListener('abort',cancel);releasePdfCanvas(canvas);}
}
