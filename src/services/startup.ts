import {nextTick,ref} from 'vue';

let finishing:Promise<void>|undefined;
export const startupPending=ref(true);
function released(){
  startupPending.value=false;
  delete document.documentElement.dataset.nativeStartup;
}
const unsubscribe=window.localPreview.onStartupUnavailable(released);
void window.localPreview.isStartupActive().then(active=>{if(!active)released();}).catch(released);
window.addEventListener('unload',unsubscribe,{once:true});
export function finishStartup(){
  finishing??=(async()=>{
    await nextTick();
    if(document.visibilityState==='visible'){
      await new Promise<void>(resolve=>{
        let first=0,second=0;
        const done=()=>{
          clearTimeout(timeout);
          cancelAnimationFrame(first);cancelAnimationFrame(second);
          resolve();
        };
        const timeout=setTimeout(done,100);
        first=requestAnimationFrame(()=>{second=requestAnimationFrame(done);});
      });
    }
    await window.localPreview.finishStartup();
    released();
    unsubscribe();
  })();
  return finishing;
}
