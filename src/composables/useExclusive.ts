import {onMounted, onBeforeUnmount, shallowRef, defineAsyncComponent, type Component} from 'vue';
import {EXCLUSIVE_PROFILE} from '@shared/exclusive';
export function useExclusive() {
  const effect = shallowRef<Component|null>(null);
  let disposed=false;
  onBeforeUnmount(()=>{disposed=true;});
  document.documentElement.dataset.exclusive='false';
  onMounted(async()=>{
    try {
      const state=await window.localPreview.getExclusiveState();
      if(!disposed && state.active && state.profile===EXCLUSIVE_PROFILE) {
        document.documentElement.dataset.exclusive='true';
        effect.value=defineAsyncComponent(()=>import('@/components/exclusive/WelcomeEffect.vue'));
      }
    } catch { /* Standard services remain available when activation cannot be read. */ }
  });
  return {effect};
}
