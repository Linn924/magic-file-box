import {computed,inject,onBeforeUnmount,onMounted,provide,ref,watch,type InjectionKey,type Ref} from 'vue';
import type {NotificationDuration} from '@shared/settings';
type Policy={duration:Readonly<Ref<NotificationDuration>>;suppressed:Readonly<Ref<boolean>>};
const policyKey:InjectionKey<Policy>=Symbol('notification-policy');
export function provideNotificationPolicy(duration:()=>NotificationDuration,suppressed:()=>boolean){
  provide(policyKey,{duration:computed(duration),suppressed:computed(suppressed)});
}

/** A shared idle timeout for floating notices; never changes the underlying job. */
export function useNotificationTimeout(options:{element:Ref<HTMLElement|undefined>;visible:()=>boolean;content:()=>unknown;dismiss:()=>void}){
  const policy=inject(policyKey,undefined),hovered=ref(false),focused=ref(false),pageVisible=ref(!document.hidden);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const eligible=computed(()=>policy?.duration.value==='5s'&&!policy.suppressed.value&&options.visible()&&!!options.element.value&&pageVisible.value&&!hovered.value&&!focused.value);
  function stop(){clearTimeout(timer);timer=undefined;}
  function restart(){
    stop();
    if(eligible.value)timer=setTimeout(()=>{timer=undefined;if(eligible.value)options.dismiss();},5000);
  }
  watch([eligible,options.content],restart,{immediate:true,flush:'post'});
  watch(options.element,element=>{hovered.value=!!element?.matches(':hover');focused.value=!!element?.contains(document.activeElement);},{flush:'post'});
  const visibility=()=>{pageVisible.value=!document.hidden;};
  onMounted(()=>document.addEventListener('visibilitychange',visibility));
  onBeforeUnmount(()=>{stop();document.removeEventListener('visibilitychange',visibility);});
  return {
    pointerenter:()=>{hovered.value=true;},
    pointerleave:()=>{hovered.value=false;},
    focusin:()=>{focused.value=true;},
    focusout:(event:FocusEvent)=>{focused.value=event.relatedTarget instanceof Node&&!!options.element.value?.contains(event.relatedTarget);},
    pointerdown:restart,
    keydown:restart,
  };
}
