import {ref,shallowRef,watch,onBeforeUnmount,nextTick,type Ref} from 'vue';
import {highlightSyntax} from './syntaxClient';
import {syntaxLanguage} from './languages';
import type {SyntaxData} from './syntaxTypes';
export function useSyntax(id:string,text:Ref<string>,ext:string,beforeInstall?:()=>()=>void){
  const data=shallowRef<SyntaxData>(),status=ref(''),lang=syntaxLanguage(ext);let revision=0;
  watch(text,async value=>{const token=++revision;data.value=undefined;status.value=lang&&value?'高亮处理中':'';if(!lang||!value)return;const result=await highlightSyntax(id+':source',value,lang);if(token!==revision)return;const restore=beforeInstall?.();data.value=result;status.value=result?'':'高亮不可用或超限，保留纯文本';await nextTick();if(token===revision)restore?.();},{immediate:true});
  onBeforeUnmount(()=>revision++);return {data,status,lang};
}
