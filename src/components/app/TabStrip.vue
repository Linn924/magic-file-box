<script setup lang="ts">
import {ref, toRef, nextTick} from 'vue';
import ToolbarIcon from '@/components/ui/ToolbarIcon.vue';
import {useTabStrip} from '@/composables/useTabStrip';
import type {PreviewFile} from '@shared/files';
import type {TabStripHandle} from './types';
const props = defineProps<{files: PreviewFile[]; active: string}>();
const emit = defineEmits<{
  select: [id: string]; close: [id: string]; open: []; settings: [];
  startDrag: [event: DragEvent, id: string]; endDrag: [];
  dropTab: [event: DragEvent, id: string]; wheel: [event: WheelEvent];
}>();
const tabsNav = ref<HTMLElement>();
const tabbar = ref<HTMLElement>();
const {overflow: tabsOverflow} = useTabStrip(tabbar, tabsNav, toRef(props, 'files'), () => {void alignActiveTab('nearest');});
async function alignActiveTab(mode: "center" | "nearest" = "nearest") {
  await nextTick();
  const bar = tabsNav.value;
  if (!bar) return;
  const tab = bar.querySelector<HTMLElement>(".tab.active");
  if (!tab) return;
  if (mode === "center") {
    const left =
      tab.offsetLeft + tab.offsetWidth / 2 - bar.clientWidth / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    return;
  }
  const tabLeft = tab.offsetLeft;
  const tabRight = tabLeft + tab.offsetWidth;
  const viewLeft = bar.scrollLeft;
  const viewRight = viewLeft + bar.clientWidth;
  if (tabLeft < viewLeft + 8)
    bar.scrollTo({ left: Math.max(0, tabLeft - 12), behavior: "smooth" });
  else if (tabRight > viewRight - 8)
    bar.scrollTo({
      left: tabRight - bar.clientWidth + 12,
      behavior: "smooth",
    });
}

defineExpose<TabStripHandle>({align: alignActiveTab});
</script>
<template>
<div v-if="files.length" ref="tabbar" class="tabbar" :class="{'has-overflow':tabsOverflow}"><nav
        v-if="files.length"
        ref="tabsNav"
        class="tabs"
        aria-label="文件标签"
        title="点击标签切换；在标签上滚动滚轮也可切换文件"
        @wheel.prevent="emit('wheel', $event)"
      >
        <div
          v-for="file in files"
          :key="file.id"
          class="tab"
          :class="{ active: file.id === active }"
          draggable="true"
          role="button"
          tabindex="0"
          :aria-label="file.name"
          :title="file.name"
          @click="emit('select', file.id)"
          @keydown.enter.prevent="emit('select', file.id)"
          @keydown.space.prevent="emit('select', file.id)"
          @dragstart="emit('startDrag', $event, file.id)"
          @dragend="emit('endDrag')"
          @dragover.prevent
          @drop.stop.prevent="emit('dropTab', $event, file.id)"
        >
          <i class="dot" :class="{ img: ['png','jpg','jpeg','webp','gif','bmp','svg'].includes(file.ext) }" aria-hidden="true"></i>
          <span class="tab-name">{{ file.name }}</span>
          <button
            type="button"
            class="tab-close"
            :aria-label="'关闭 ' + file.name"
            title="关闭"
            @click.stop="emit('close', file.id)"
          >
            <ToolbarIcon name="cancel" />
          </button>
        </div>
        <button
          v-if="!tabsOverflow"
          type="button"
          class="tab-add-file"
          title="打开文件（Ctrl+O）"
          aria-label="打开文件"
          @click="emit('open')"
        >
          <ToolbarIcon name="plus" />
        </button>
      </nav>
      <span class="tab-actions">
        <button v-if="tabsOverflow" type="button" class="tab-add-file" title="打开文件（Ctrl+O）" aria-label="打开文件" @click="emit('open')"><ToolbarIcon name="plus" /></button>
        <button
          type="button"
          class="settings-button tab-settings"
          aria-label="设置"
          title="设置"
          @click="emit('settings')"
        >
          <ToolbarIcon name="settings" />
        </button>
      </span></div>
</template>
