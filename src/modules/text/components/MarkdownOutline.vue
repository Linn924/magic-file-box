<script setup lang="ts">
import {ref,computed,watch,nextTick,onMounted,onBeforeUnmount} from 'vue';
import {createSafeResizeObserver} from '@/utils/safeResizeObserver';
const props=defineProps<{headings:Array<{anchor:string;text:string;level:number}>;active:string}>();
const emit=defineEmits<{jump:[string]}>();
const root=ref<HTMLElement>(),top=ref(0),height=ref(500),rowHeight=28;
const start=computed(()=>Math.max(0,Math.floor(top.value/rowHeight)-6));
const end=computed(()=>Math.min(props.headings.length,start.value+Math.ceil(height.value/rowHeight)+12));
const visible=computed(()=>props.headings.slice(start.value,end.value));
function update(){if(root.value){top.value=root.value.scrollTop;height.value=root.value.clientHeight;}}
function reveal(index:number){const element=root.value;if(!element)return;const y=index*rowHeight;if(y<element.scrollTop)element.scrollTop=y;else if(y+rowHeight>element.scrollTop+element.clientHeight)element.scrollTop=y+rowHeight-element.clientHeight;update();}
async function key(event:KeyboardEvent,index:number){const offsets:Record<string,number>={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:props.headings.length-1};if(!(event.key in offsets))return;event.preventDefault();const next=Math.max(0,Math.min(props.headings.length-1,offsets[event.key]));reveal(next);await nextTick();root.value?.querySelector<HTMLElement>(`[data-outline-index="${next}"]`)?.focus({preventScroll:true});}
watch(()=>props.active,anchor=>{const index=props.headings.findIndex(h=>h.anchor===anchor);if(index>=0)reveal(index);});
watch(()=>props.headings,()=>{if(root.value)root.value.scrollTop=0;update();});
const observer=createSafeResizeObserver(update);onMounted(()=>{update();if(root.value)observer.observe(root.value);});onBeforeUnmount(()=>observer.disconnect());
</script>
<template><nav ref="root" class="md-outline" aria-label="标题目录" @scroll.passive="update"><p v-if="!headings.length" class="md-outline-empty">文档没有标题</p><div :style="{height:start*rowHeight+'px'}" aria-hidden="true"></div><button v-for="(heading,i) in visible" :key="heading.anchor" type="button" :data-outline-index="start+i" :title="heading.text" :aria-current="active===heading.anchor?'location':undefined" :style="{height:rowHeight+'px',paddingLeft:10+(heading.level-1)*12+'px'}" @keydown="key($event,start+i)" @click="emit('jump',heading.anchor)">{{heading.text}}</button><div :style="{height:Math.max(0,headings.length-end)*rowHeight+'px'}" aria-hidden="true"></div></nav></template>
