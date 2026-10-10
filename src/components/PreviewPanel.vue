<script setup lang="ts">
import {ref,watch,nextTick,onBeforeUnmount,onMounted} from 'vue';
import ToolButton from './ToolButton.vue';
const props=defineProps<{open:boolean;title:string;target:string;trigger:string;closeLabel:string}>();
const emit=defineEmits<{'update:open':[boolean]}>();
const panel=ref<HTMLElement>(),x=ref(8),y=ref(80);let placed=false,disposed=false;
function host(){return document.querySelector<HTMLElement>(props.target);}
function clamp(){const root=host(),element=panel.value;if(!root?.clientWidth||!element)return;x.value=Math.max(8,Math.min(root.clientWidth-element.offsetWidth-8,x.value));y.value=Math.max(8,Math.min(root.clientHeight-Math.min(element.offsetHeight,160)-8,y.value));}
function focusInput(){void nextTick(()=>{panel.value?.querySelector<HTMLElement>('input,textarea,select')?.focus({preventScroll:true});});}
watch(()=>props.open,async (open,previous)=>{await nextTick();if(disposed)return;if(open){const root=host(),element=panel.value;if(root&&element&&!placed){const toolbar=root.parentElement?.querySelector('.actbar')?.getBoundingClientRect(),bounds=root.getBoundingClientRect();x.value=Math.max(8,root.clientWidth-element.offsetWidth-12);y.value=toolbar?toolbar.bottom-bounds.top+8:80;placed=true;}clamp();focusInput();}else if(previous){const root=host();if(root?.clientWidth)root.parentElement?.querySelector<HTMLElement>(props.trigger)?.focus({preventScroll:true});}},{immediate:true});
let drag:{id:number;x:number;y:number;left:number;top:number}|undefined;
function start(event:PointerEvent){if(event.button!==0||(event.target as Element).closest('button'))return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:x.value,top:y.value};(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
function move(event:PointerEvent){if(!drag||event.pointerId!==drag.id)return;x.value=drag.left+event.clientX-drag.x;y.value=drag.top+event.clientY-drag.y;clamp();}
function end(){drag=undefined;}
function close(){emit('update:open',false);}
onMounted(()=>window.addEventListener('resize',clamp));onBeforeUnmount(()=>{disposed=true;window.removeEventListener('resize',clamp);});
defineExpose({focusInput});
</script>
<template><Teleport :to="target" defer><section v-if="open" ref="panel" class="preview-floating-panel" role="dialog" aria-modal="false" :aria-label="title" :style="{left:x+'px',top:y+'px',maxHeight:`calc(100% - ${y+8}px)`}" @keydown.esc.stop.prevent="close"><header class="preview-panel-head" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end"><strong>{{title}}</strong><ToolButton class="search-close" icon="cancel" :title="closeLabel+'（Esc）'" @click="close" /></header><div class="preview-panel-content"><slot /></div></section></Teleport></template>
