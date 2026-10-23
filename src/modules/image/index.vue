<script setup lang="ts">
import type { PreviewProps } from "@/modules/types";
import { usePreview } from "./composables/usePreview";
import ToolButton from '@/components/ui/ToolButton.vue';
import ImageTools from './components/ImageTools.vue';
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const {
  pane,
  url,
  style,frameStyle,
  dimensions,
  natural,
  loaded,
  rotate,
  cycleRotate,
  originalPixels,
  toggleOriginal,
  fitLabel,
} = usePreview(props, emit);
</script>
<template>
  <section ref="pane" class="image-pane">
    <Teleport :to="`[data-file-id='${props.file.id}'] .module-tools`" defer>
      <span class="image-toolbar filebar-inline">
        <span class="preview-tool-group" data-image-group="view"><ToolButton icon="original"
          class="image-original"
          :pressed="originalPixels"
          :title="originalPixels?'切回适配窗口':'原始像素查看'"
          @click="toggleOriginal"
        /><ToolButton icon="rotate"
          class="image-rotate"
          :title="'旋转（当前 ' + rotate + '°）'"
          @click="cycleRotate"
        /></span>
      </span>
    </Teleport>
    <ImageTools :file="file" :rotation="rotate" target=".image img" :size="natural"/>
    <div class="image">
      <div class="image-frame" :style="frameStyle">
      <img
        class="preview-content"
        :src="url"
        :alt="file.name"
        :style="[style, { transform: `translate(-50%, -50%) rotate(${rotate}deg)` }]"
        @load="loaded"
        @error="emit('error', '无法解码图片，文件可能损坏或格式不受支持。')"
      />
      </div>
    </div>
    <Teleport :to="`[data-file-id='${file.id}'] .file-details`" defer><span class="image-dimensions" :title="dimensions">{{dimensions}}</span><span class="image-fit-label" :title="fitLabel">{{fitLabel}}</span></Teleport>
  </section>
</template>
