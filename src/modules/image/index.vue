<script setup lang="ts">
import type { PreviewProps } from "../types";
import { usePreview } from "./usePreview";
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
        <button
          type="button"
          class="image-rotate icon-only-btn"
          :title="'旋转（当前 ' + rotate + '°）'"
          aria-label="旋转图片"
          @click="cycleRotate"
        >
          <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M13.2 8A5.2 5.2 0 1 1 11.4 4.2" />
            <path d="M13.2 2.6v3h-3" />
          </svg>
          <span class="sr-only">旋转 {{ rotate }}°</span>
        </button>
        <button
          type="button"
          class="image-original icon-only-btn"
          :aria-pressed="originalPixels"
          :title="originalPixels ? '适配窗口' : '原始像素'"
          aria-label="原始像素"
          @click="toggleOriginal"
        >
          <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
            <path d="M5 8h6M8 5v6" />
          </svg>
          <span class="sr-only">{{ originalPixels ? "适配窗口" : "原始像素" }}</span>
        </button>
        <span class="image-fit-label">{{ fitLabel }}</span>
      </span>
    </Teleport>
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
    <div class="pane-footer">
      {{ dimensions }}
      <span>{{ fitLabel }}</span>
    </div>
  </section>
</template>
