import { shallowRef } from 'vue';
import { setFileCacheBudget } from '@/services/fileContentCache';
export const pdfResources = shallowRef({pixels:24_000_000,bytes:384*1024*1024,documents:8});
let initial: Promise<void> | undefined;
let subscribed=false;
export function ensurePdfResources() {
  if(!initial)initial=(async()=>{
    if(typeof window==='undefined'||!window.localPreview?.pdfResources)return;
    if(!subscribed){window.localPreview.onPdfResources(value=>{pdfResources.value=value;setFileCacheBudget(value.bytes);});subscribed=true;}
    const value=await window.localPreview.pdfResources();pdfResources.value=value;setFileCacheBudget(value.bytes);
  })().catch(()=>{initial=undefined;});
  return initial;
}
export function releasePdfResources() {
  if(typeof window!=='undefined'&&initial){window.localPreview.releasePdfResources();initial=undefined;}
}
