<script setup lang="ts">
import ToolbarIcon from '@/components/ui/ToolbarIcon.vue';
const emit = defineEmits<{open: []; settings: []}>();
</script>
<template>
    <header class="app-header">
      <button
        class="settings-button"
        aria-label="设置"
        title="设置"
        @click="emit('settings')"
      >
        <ToolbarIcon name="settings" />
      </button>
    </header>
    <section class="welcome">
      <slot />
      <button class="dropzone" @click="emit('open')">
        <span class="file-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 11V3M5 6l3-3 3 3M3 12.5h10" />
          </svg>
        </span>
        <strong>打开文件</strong>
        <span class="drop-hint">或将文件拖到此处</span>
      </button>
      <div class="formats">
        <span>Word</span><span>Excel</span><span>PowerPoint</span
        ><span>PDF</span><span>图片</span><span>文本</span>
      </div>
    </section>
</template>
