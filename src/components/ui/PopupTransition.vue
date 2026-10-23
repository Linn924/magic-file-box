<script setup lang="ts">
defineProps<{floating?:boolean;notice?:boolean;disabled?:boolean}>();

// A leaving popup remains visible for its animation but must no longer accept input.
const previous=new WeakMap<Element,{inert:boolean;hidden:string|null}>();
function leaving(element:Element){
  if(!(element instanceof HTMLElement))return;
  previous.set(element,{inert:element.inert,hidden:element.getAttribute('aria-hidden')});
  element.inert=true;
  element.setAttribute('aria-hidden','true');
}
function restore(element:Element){
  const state=previous.get(element);
  if(!state||!(element instanceof HTMLElement))return;
  element.inert=state.inert;
  if(state.hidden===null)element.removeAttribute('aria-hidden');
  else element.setAttribute('aria-hidden',state.hidden);
  previous.delete(element);
}
</script>
<template>
  <Transition :name="notice?'notification-slide':floating?'popup-tv-floating':'popup-tv'" :css="!disabled" appear
    @before-leave="leaving" @leave-cancelled="restore" @after-leave="restore" @before-enter="restore">
    <slot />
  </Transition>
</template>
