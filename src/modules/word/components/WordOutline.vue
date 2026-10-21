<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {createSafeResizeObserver} from '@/utils/safeResizeObserver';
import type {WordHeading} from '../composables/useDocxNavigation';
const props = defineProps<{headings: WordHeading[]; active: string}>();
const emit = defineEmits<{jump: [id: string]}>();
const root = ref<HTMLElement>(), top = ref(0), height = ref(400), rowHeight = 30;
const start = computed(() => Math.max(0, Math.floor(top.value / rowHeight) - 5));
const end = computed(() => Math.min(props.headings.length, start.value + Math.ceil(height.value / rowHeight) + 10));
const visible = computed(() => props.headings.slice(start.value, end.value));
function update() { if (root.value) { top.value = root.value.scrollTop; height.value = root.value.clientHeight; } }
function reveal(index: number) {
  const element = root.value; if (!element) return;
  const position = index * rowHeight;
  if (position < element.scrollTop) element.scrollTop = position;
  else if (position + rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = position + rowHeight - element.clientHeight;
  update();
}
async function key(event: KeyboardEvent, index: number) {
  const next = {ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: props.headings.length - 1}[event.key];
  if (next === undefined) return;
  event.preventDefault(); const target = Math.max(0, Math.min(props.headings.length - 1, next));
  reveal(target); await nextTick(); root.value?.querySelector<HTMLElement>(`[data-word-outline-index="${target}"]`)?.focus({preventScroll: true});
}
watch(() => props.active, id => { const index = props.headings.findIndex(h => h.id === id); if (index >= 0) reveal(index); });
const observer = createSafeResizeObserver(update);
onMounted(() => { update(); if (root.value) observer.observe(root.value); });
onBeforeUnmount(() => observer.disconnect());
</script>
<template>
  <nav ref="root" class="word-outline" aria-label="DOCX 标题目录" @scroll.passive="update">
    <p v-if="!headings.length" class="word-outline-empty">未找到标题样式或大纲级别</p>
    <div :style="{height:start*rowHeight+'px'}" aria-hidden="true"></div>
    <button v-for="(heading,i) in visible" :key="heading.id" type="button" :data-word-outline-index="start+i" :title="heading.text"
      :aria-current="active===heading.id?'location':undefined" :style="{height:rowHeight+'px',paddingLeft:10+(heading.level-1)*10+'px'}"
      @keydown="key($event,start+i)" @click="emit('jump',heading.id)">{{heading.text}}</button>
    <div :style="{height:Math.max(0,headings.length-end)*rowHeight+'px'}" aria-hidden="true"></div>
  </nav>
</template>
