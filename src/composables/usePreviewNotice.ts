import {computed,inject,onBeforeUnmount,provide,shallowRef,toValue,watch,type InjectionKey,type MaybeRefOrGetter} from 'vue';
import type {PreviewFile} from '@shared/files';
type Entry={owner:symbol;text:string};
type Reporter={set:(key:string,owner:symbol,text:string)=>void;remove:(key:string,owner:symbol)=>void};
const noticeKey:InjectionKey<Reporter>=Symbol('preview-notices');
const identity=(key:string,text:string)=>JSON.stringify([key,text]);

/** Notices and dismissals belong to this file's in-memory session only. */
export function usePreviewNoticeHost(file:PreviewFile){
  const entries=shallowRef(new Map<string,Entry>());
  const dismissed=shallowRef(new Set(file.view?.dismissedPreviewNotices??[]));
  provide(noticeKey,{
    set(key,owner,text){
      const next=new Map(entries.value);
      if(text.trim())next.set(key,{owner,text:text.trim()});else if(next.get(key)?.owner===owner)next.delete(key);
      entries.value=next;
    },
    remove(key,owner){if(entries.value.get(key)?.owner===owner){const next=new Map(entries.value);next.delete(key);entries.value=next;}},
  });
  const messages=computed(()=>[...new Set([...entries.value].filter(([key,entry])=>!dismissed.value.has(identity(key,entry.text))).map(([,entry])=>entry.text))]);
  function dismiss(){
    const next=new Set(dismissed.value);
    for(const [key,entry] of entries.value)next.add(identity(key,entry.text));
    dismissed.value=new Set([...next].slice(-64));
    file.view??={zoom:100,scroll:[]};file.view.dismissedPreviewNotices=[...dismissed.value];
  }
  return {messages,dismiss};
}

export function usePreviewNotice(key:string,message:MaybeRefOrGetter<string>){
  const host=inject(noticeKey,undefined),owner=Symbol(key);
  watch(()=>toValue(message),text=>host?.set(key,owner,text),{immediate:true});
  onBeforeUnmount(()=>host?.remove(key,owner));
}
