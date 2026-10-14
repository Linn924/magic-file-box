import {nextTick,onMounted,onBeforeUnmount} from 'vue';
import type {Settings} from '@shared/contracts';
import {appearanceCss} from '../core/appearanceCss';
const clients=new Set<()=>()=>void>();
let sheet:HTMLStyleElement|undefined,unsubscribe:(()=>void)|undefined,revision=0,current='';
function apply(settings:Settings){
  revision++;let css:string;try{css=appearanceCss(settings.codeAppearance);}catch{css=appearanceCss({...settings.codeAppearance,fontFamily:'',customCss:''});}
  if(css===current&&sheet)return;const restore=Array.from(clients,client=>client());current=css;
  sheet??=Object.assign(document.createElement('style'),{textContent:css});sheet.dataset.codeAppearanceRules='';sheet.textContent=css;if(!sheet.isConnected)document.head.append(sheet);
  void nextTick().then(()=>{for(const done of restore)done();});
}
/** One style/subscription per renderer window, released with its last text view. */
export function useCodeAppearance(capture:()=>()=>void){
  onMounted(()=>{clients.add(capture);if(clients.size===1){unsubscribe=window.localPreview.onSettings(apply);const token=revision;void window.localPreview.getSettings().then(settings=>{if(clients.size&&token===revision)apply(settings);}).catch(()=>{});}});
  onBeforeUnmount(()=>{clients.delete(capture);if(!clients.size){revision++;unsubscribe?.();unsubscribe=undefined;sheet?.remove();sheet=undefined;current='';}});
}
