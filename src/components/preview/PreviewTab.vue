<script setup lang="ts">
import { ref, nextTick, watch, computed, provide, onBeforeUnmount } from "vue";
import { getPreviewModule } from "@/modules";
import FitControl from "./FitControl.vue";
import type { FitMode } from "@/utils/fit";
import type { PreviewModule } from "@/modules/types";
import ZoomControl from "./ZoomControl.vue";
import ToolButton from '@/components/ui/ToolButton.vue';
import {fileSize} from '@/utils/formatters';
import type {PreviewFile} from '@shared/files';
import { usePreviewLoad } from '@/composables/usePreviewLoad';
import {usePreviewNoticeHost} from '@/composables/usePreviewNotice';
import PreviewNotices from './PreviewNotices.vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
const props = defineProps<{
  file: PreviewFile;
  initialZoom: number;
  immersive?: boolean;
  /** Whether this tab is the active tab (for memory cache). */
  active?: boolean;
}>();
const {messages:notices,dismiss:dismissNotices}=usePreviewNoticeHost(props.file);
function dismissNotice(){
  const restore=document.activeElement?.closest('.preview-notice');
  dismissNotices();
  if(restore)void nextTick(()=>document.querySelector<HTMLElement>(`[data-file-id="${props.file.id}"] .preview-body`)?.focus({preventScroll:true}));
}
const printAllowed=ref(props.file.view?.pdfPrintAllowed!==false);
provide('pdfAllowPrint',printAllowed);
provide('pdf:set-print-permission',(allowed:boolean,password?:string)=>{
  printAllowed.value=allowed;
  props.file.view ??= {zoom:props.initialZoom,scroll:[]};
  props.file.view.pdfPrintAllowed=allowed;
  if(password)props.file.view.pdfPassword=password;
});

function saveViewState() {
  props.file.view ??= { zoom: zoom.value, scroll: [] };
  props.file.view.zoom = zoom.value;
  props.file.view.fit = fitMode.value;
  props.file.view.scroll = scrollers().map((el) => ({
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
}

const { preview, phase, error, busy, label, elapsed, retry } = usePreviewLoad(props, loaded,()=>module.value?.closeFile?.(props.file.id));
watch(() => props.active, active => { if (!active && preview.value) saveViewState(); }, { flush: 'sync' });
onBeforeUnmount(()=>{
 saveViewState();
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
function toggleFullscreen() {
  (document.activeElement as HTMLElement)?.blur();
  void window.localPreview.setFullscreen(!props.immersive);
}
async function loaded() {
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
      <span class="badge" aria-label="文件格式"><span class="file-extension">{{ file.ext.toUpperCase() }}</span></span>
      <div class="filename">
        <strong :title="file.name">{{ file.name }}</strong>
      </div>
      <span class="file-details" :data-details-for="file.id"></span>
      <small class="filesize">{{ fileSize(file.size) }}</small>
    </div>
    <!-- Plan B: action strip -->
    <div class="filebar actbar" role="toolbar" aria-label="文件预览工具">
      <span v-if="!error" class="preview-tool-group" data-preview-group="view"><ZoomControl v-model="zoom" /><FitControl v-if="module?.pageFit && (!file.source || ['pdf','image'].includes(file.source.kind))" v-model="fitMode" @update:model-value="zoom = 100" /></span>
      <span class="module-tools" :data-tools-for="file.id"></span>
      <span v-if="module?.toolbar && !error && !file.source" class="preview-tool-group" data-preview-group="output"><component
        v-if="module?.toolbar && !error && !file.source"
        :is="module.toolbar"
        :file="file"
      /></span>
      <span class="flex-sp"></span>
      <ToolButton class="immersive-toggle" icon="fullscreen" :title="immersive ? '退出全屏（Esc）' : '沉浸阅读（F11）'" :pressed="immersive" @click="toggleFullscreen" />
    </div>
    <div class="floating-tools"></div>
    <Teleport to="#preview-notice-target" defer><PopupTransition notice><PreviewNotices v-if="active && phase==='ready' && !error && notices.length" :file-name="file.name" :messages="notices" @dismiss="dismissNotice"/></PopupTransition></Teleport>
    <div class="preview-body" tabindex="-1" :aria-busy="busy && phase !== 'password'" :data-load-phase="phase">
      <div v-if="error" class="error" role="alert">
        <strong>暂时无法预览</strong>
        <p>{{ error }}</p>
        <button v-if="!file.error" class="preview-retry" @click="retry">重新加载</button>
      </div>
      <div v-if="active && busy" class="loading" :class="{ 'loading-password': phase === 'password' }" role="status" aria-live="polite">
        <span v-if="phase !== 'password'" class="loading-spinner" aria-hidden="true"></span>
        <span>{{ label }}</span>
        <small v-if="elapsed >= 3 && phase !== 'password'" aria-live="off">已用 {{ elapsed }} 秒</small>
        <button v-if="elapsed >= 10 && phase !== 'password'" class="preview-retry" @click="retry">重新加载</button>
      </div>
      <component
        v-if="preview"
        :key="preview.key"
        :is="preview.file.source && module?.sourceComponent ? module.sourceComponent : module?.component"
        :file="preview.file"
        :zoom="zoom"
        :fit-mode="fitMode"
        @update:zoom="zoom = $event"
        v-on="preview.events"
      />
    </div>
  </section>
</template>
