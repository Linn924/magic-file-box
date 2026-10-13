import {ref,onMounted,onBeforeUnmount} from 'vue';
import type {UpdateState,UpdateAction} from '../../shared/updates';
export function useUpdates(notice=false,canNotify:()=>boolean=()=>true){
  const state=ref<UpdateState>({phase:'idle',currentVersion:'',progress:0,total:0,transferred:0,message:''}),visible=ref(false),pending=ref(false);let disposed=false,changed=false,sequence=0;const cleanups:Array<()=>void>=[];
  onMounted(async()=>{cleanups.push(window.localPreview.onUpdateState(value=>{sequence++;changed=true;state.value=value;}));if(notice)cleanups.push(window.localPreview.onUpdateNotice(()=>{if(canNotify())visible.value=true;}));try{const initial=await window.localPreview.getUpdateState();if(!disposed&&!changed)state.value=initial;}catch{state.value.message='更新状态暂不可用，请稍后重试。';}});
  onBeforeUnmount(()=>{disposed=true;cleanups.forEach(fn=>fn());});
  async function act(action:UpdateAction){if(pending.value&&action!=='cancel')return;if(action!=='cancel')pending.value=true;const before=sequence;try{const result=await window.localPreview.updateAction(action);if(!disposed&&sequence===before)state.value=result;}catch{state.value.message='更新未完成，请稍后重试。';}finally{if(action!=='cancel')pending.value=false;}}
  return {state,visible,pending,act};
}
