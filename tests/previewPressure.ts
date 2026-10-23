import type {TestContext} from './context';
import type {BrowserWindow} from 'electron';
/** Supply a high Chromium heap reading; exercise the normal focus/pressure path. */
export async function applyPreviewPressure(c:TestContext,win:BrowserWindow){
  await c.evaluate(win,"(()=>{window.__heapDescriptor=Object.getOwnPropertyDescriptor(performance,'memory');Object.defineProperty(performance,'memory',{configurable:true,value:{usedJSHeapSize:950000000,jsHeapSizeLimit:1000000000}});window.dispatchEvent(new Event('focus'));})()");
  return ()=>c.evaluate(win,"(()=>{if(window.__heapDescriptor)Object.defineProperty(performance,'memory',window.__heapDescriptor);else delete performance.memory;delete window.__heapDescriptor;})()");
}
export async function evictInactivePreviews(c:TestContext,win:BrowserWindow){
  const restore=await applyPreviewPressure(c,win);
  try{
    await c.check(win,'memory pressure releases only inactive completed preview components',"[...document.querySelectorAll('.preview-tab')].filter(tab=>!tab.getClientRects().length).every(tab=>['idle','error'].includes(tab.querySelector('.preview-body').dataset.loadPhase))");
  }finally{
    await restore();
  }
}
