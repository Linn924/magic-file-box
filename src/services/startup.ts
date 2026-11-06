import {nextTick,ref} from 'vue';

let finishing:Promise<void>|undefined;
export const startupPending=ref(true);
export function finishStartup(){
  finishing??=(async()=>{
    await nextTick();
    await window.localPreview.finishStartup();
    startupPending.value=false;
  })();
  return finishing;
}
