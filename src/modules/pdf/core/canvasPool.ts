import { watch } from 'vue';
import { pdfResources } from './resources';
type Entry={canvas:HTMLCanvasElement;temporary:boolean;pixels:number};
const canvases = new Map<HTMLCanvasElement,Entry>();
let totalPixels=0;
function publish() {
  if(typeof document==='undefined')return;
  document.documentElement.dataset.pdfCanvasPixels=String(totalPixels);
  document.documentElement.dataset.pdfCanvasBudget=String(pdfResources.value.pixels);
}
export function releasePdfCanvas(canvas:HTMLCanvasElement) {
  totalPixels-=canvases.get(canvas)?.pixels??0;canvases.delete(canvas);
  canvas.width=0;canvas.height=0;publish();
}
/** Call after DOM/visibility changes, outside allocation/query hot paths. */
export function prunePdfCanvases() {
  for(const entry of canvases.values()) {
    if(entry.temporary)continue;
    const tab=entry.canvas.closest<HTMLElement>('.preview-tab');
    if(!entry.canvas.isConnected||(tab&&getComputedStyle(tab).display==='none'))releasePdfCanvas(entry.canvas);
  }
}
export function pdfCanvasStats() { return {count:canvases.size,pixels:totalPixels,budget:pdfResources.value.pixels}; }
export function availablePdfPixels(canvas?:HTMLCanvasElement) {
  return Math.max(0,pdfResources.value.pixels-totalPixels+(canvas?canvases.get(canvas)?.pixels??0:0));
}
export function allocatePdfCanvas(canvas:HTMLCanvasElement,width:number,height:number,temporary=false) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>availablePdfPixels(canvas))return false;
  totalPixels-=canvases.get(canvas)?.pixels??0;
  canvas.width=width;canvas.height=height;canvases.set(canvas,{canvas,temporary,pixels:width*height});totalPixels+=width*height;publish();return true;
}
watch(pdfResources,()=>{
  prunePdfCanvases();
  for(const entry of canvases.values()) {
    if(totalPixels<=pdfResources.value.pixels)break;
    if(!entry.temporary)releasePdfCanvas(entry.canvas);
  }
  publish();
});
