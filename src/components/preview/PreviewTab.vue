<script setup lang="ts">
import { ref, shallowRef, nextTick, watch, computed, provide, onMounted, onBeforeUnmount } from "vue";
import { getPreviewModule } from "@/modules";
import FitControl from "./FitControl.vue";
import type { FitMode } from "@/utils/fit";
import type { PreviewModule } from "@/modules/types";
import ZoomControl from "./ZoomControl.vue";
import ToolButton from '@/components/ui/ToolButton.vue';
import {fileSize} from '@/utils/formatters';
import type {PreviewFile} from '@shared/files';
import { cachePut, cacheGet, cacheDrop, cacheHas } from "@/services/fileContentCache";
const props = defineProps<{
  file: PreviewFile;
  initialZoom: number;
  immersive?: boolean;
  /** Whether this tab is the active tab (for memory cache). */
  active?: boolean;
}>();
const printAllowed=ref(props.file.view?.pdfPrintAllowed!==false);
provide('pdfAllowPrint',printAllowed);
provide('pdf:set-print-permission',(allowed:boolean,password?:string)=>{
  printAllowed.value=allowed;
  props.file.view ??= {zoom:props.initialZoom,scroll:[]};
  props.file.view.pdfPrintAllowed=allowed;
  if(password)props.file.view.pdfPassword=password;
});

const content=shallowRef<PreviewFile>();
let disposed=false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
/** Stagger loadPreview across tabs so multi-open does not spike CPU. */
let loadQ: Promise<unknown> = Promise.resolve();
function enqueueLoad(fn: () => Promise<unknown>) {
  loadQ = loadQ.then(fn).catch(() => undefined);
  return loadQ;
}

async function ensureLoaded() {
  if (content.value?.bytes?.byteLength || content.value?.error) return content.value;
  const hit = cacheGet(props.file.id);
  if (hit) {
    hit.view = props.file.view;
    content.value = hit;
    ready.value = true;
    return hit;
  }
  if (props.file.error) {
    content.value = props.file;
    ready.value = true;
    return content.value;
  }
  ready.value = false;
  const loaded = await window.localPreview.loadPreview(props.file);
  if (disposed) return;
  if(loaded.view?.pdfPassword){props.file.view??={zoom:props.initialZoom,scroll:[]};props.file.view.pdfPassword=loaded.view.pdfPassword;}
  loaded.view = props.file.view;
  cachePut(props.file.id, loaded);
  content.value = loaded;
  if (loaded.error) {
    error.value = loaded.error;
    ready.value = true;
  }
  return loaded;
}

function saveViewState() {
  props.file.view ??= { zoom: zoom.value, scroll: [] };
  props.file.view.zoom = zoom.value;
  props.file.view.fit = fitMode.value;
  props.file.view.scroll = scrollers().map((el) => ({
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
}

function scheduleUnload() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (props.active || disposed) return;
    // Drop mounted module/PDF.js state only; bytes stay in shared cache.
    content.value = undefined;
  }, 2000);
}

onMounted(() => {
  if (!props.active) return;
  void enqueueLoad(async () => {
    await ensureLoaded();
    if (!props.active) scheduleUnload();
  });
});
watch(
  () => props.active,
  (on) => {
    if (on) {
      clearTimeout(idleTimer);
      void enqueueLoad(() => ensureLoaded());
    } else {
      if (!content.value) return;
      saveViewState();
      scheduleUnload();
    }
  },
);
onBeforeUnmount(()=>{
 disposed=true;
 clearTimeout(idleTimer);
 saveViewState();
 content.value=undefined;
 cacheDrop(props.file.id);
 void module.value?.closeFile?.(props.file.id);
});
const module = computed(
  () => getPreviewModule(props.file.ext) as PreviewModule | undefined,
);
props.file.view ??= { zoom: props.initialZoom, scroll: [] };
const fitMode = ref<FitMode>(props.file.view.fit ?? "original");
watch(fitMode, value => { props.file.view!.fit = value; }, { flush: 'sync' });
let saved:
  | { zoom: number; fit: FitMode; scroll: Array<{ top: number; left: number }> }
  | undefined;
const scrollers = () =>
  Array.from(
    document
      .querySelector(`[data-file-id="${props.file.id}"]`)
      ?.querySelectorAll<HTMLElement>(
        ".pdf-scroll,.slide-scroll,.document-scroll,.table-wrap,.text-scroll,.image",
      ) || [],
  );
watch(
  () => props.immersive,
  async (value) => {
    if (value) {
      saved = {
        zoom: zoom.value,
        fit: fitMode.value,
        scroll: scrollers().map((el) => ({
          top: el.scrollTop,
          left: el.scrollLeft,
        })),
      };
      if (module.value?.pageFit) {
        fitMode.value = "page";
        zoom.value = 100;
      }
    } else if (saved) {
      zoom.value = saved.zoom;
      fitMode.value = saved.fit;
      await nextTick();
      setTimeout(
        () =>
          scrollers().forEach((el, i) => {
            el.scrollTop = saved?.scroll[i]?.top || 0;
            el.scrollLeft = saved?.scroll[i]?.left || 0;
          }),
        150,
      );
    }
  },
);
const zoom = ref(props.file.view?.zoom ?? props.initialZoom);
const error = ref(props.file.error);
const ready = ref(false);
function toggleFullscreen() {
  (document.activeElement as HTMLElement)?.blur();
  void window.localPreview.setFullscreen(!props.immersive);
}
async function loaded() {
  ready.value = true;
  await nextTick();
  const root = document.querySelector(`[data-file-id="${props.file.id}"]`);
  root
    ?.querySelectorAll<HTMLElement>(
      ".pdf-scroll,.slide-scroll,.document-scroll,.table-wrap,.text-scroll,.image",
    )
    .forEach((el, i) => {
      const saved = props.file.view?.scroll[i];
      if (saved) {
        el.scrollTop = saved.top;
        el.scrollLeft = saved.left;
      }
    });
}
</script>
<template>
  <section class="preview-tab" :data-file-id="file.id">
    <!-- Plan B: identity strip (type · name · size) -->
    <div class="filebar idbar">
      <span class="badge">{{ file.ext.toUpperCase() }}</span>
      <div class="filename">
        <strong :title="file.name">{{ file.name }}</strong>
      </div>
      <small class="filesize">{{ fileSize(file.size) }}</small>
    </div>
    <!-- Plan B: action strip -->
    <div class="filebar actbar" role="toolbar" aria-label="文件预览工具">
      <span v-if="!error" class="preview-tool-group" data-preview-group="view"><ZoomControl v-model="zoom" /><FitControl v-if="module?.pageFit" v-model="fitMode" @update:model-value="zoom = 100" /></span>
      <span class="module-tools" :data-tools-for="file.id"></span>
      <span v-if="module?.toolbar && !error" class="preview-tool-group" data-preview-group="output"><component
        v-if="module?.toolbar && !error"
        :is="module.toolbar"
        :file="file"
      /></span>
      <span class="flex-sp"></span>
      <ToolButton class="immersive-toggle" icon="fullscreen" :title="immersive ? '退出全屏（Esc）' : '沉浸阅读（F11）'" :pressed="immersive" @click="toggleFullscreen" />
    </div>
    <div class="floating-tools"></div>
    <div v-if="error" class="error" role="alert">
      <strong>暂时无法预览</strong>
      <p>{{ error }}</p>
    </div>
    <template v-else
      ><div v-if="active && !ready" class="loading" role="status">正在解析文件…</div>
      <component
        v-if="content && !content.error"
        :is="getPreviewModule(file.ext)?.component"
        :file="content"
        :zoom="zoom"
        :fit-mode="fitMode"
        @update:zoom="zoom = $event"
        @ready="loaded"
        @error="
          error = $event;
          ready = true;
        "
    /></template>
  </section>
</template>
