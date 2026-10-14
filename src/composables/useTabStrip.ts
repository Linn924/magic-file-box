import {ref,watch,nextTick,onBeforeUnmount,type Ref} from 'vue';
import {createSafeResizeObserver} from '@/utils/safeResizeObserver';
/** Compare intrinsic tab widths against the same action reservation in both modes. */
export function useTabStrip(root:Ref<HTMLElement|undefined>,nav:Ref<HTMLElement|undefined>,items:Ref<unknown[]>,onLayout:()=>void){
  const overflow=ref(false);let observer:ResizeObserver|undefined,lastWidth=-1,disposed=false;
  const number=(value:string)=>parseFloat(value)||0;
  function measure(){
    const row=root.value,strip=nav.value;if(!row?.clientWidth||!strip)return;
    const tabs=Array.from(strip.querySelectorAll<HTMLElement>('.tab')),add=row.querySelector<HTMLElement>('.tab-add-file'),settings=row.querySelector<HTMLElement>('.tab-settings');if(!add||!settings)return;
    const style=getComputedStyle(row),gap=number(getComputedStyle(strip).columnGap),addStyle=getComputedStyle(add),settingsStyle=getComputedStyle(settings);
    const need=tabs.reduce((sum,tab)=>sum+tab.getBoundingClientRect().width,0)+tabs.length*gap+add.getBoundingClientRect().width+number(addStyle.marginLeft)+number(addStyle.marginRight);
    const available=row.getBoundingClientRect().width-number(style.paddingLeft)-number(style.paddingRight)-settings.getBoundingClientRect().width-number(settingsStyle.marginLeft)-number(settingsStyle.marginRight);
    const next=need>available+.01,changed=next!==overflow.value;overflow.value=next;
    if(changed||strip.clientWidth!==lastWidth){lastWidth=strip.clientWidth;void nextTick(()=>{if(!disposed)onLayout();});}
  }
  watch([root,nav],()=>{observer?.disconnect();observer=createSafeResizeObserver(measure);if(root.value)observer.observe(root.value);if(nav.value)observer.observe(nav.value);void nextTick(measure);},{flush:'post'});
  watch(items,()=>{void nextTick(measure);},{flush:'post'});
  onBeforeUnmount(()=>{disposed=true;observer?.disconnect();});
  return {overflow,measure};
}
