<script setup lang="ts">
import {ref, watch} from 'vue';

const props = defineProps<{startedAt: number; retry?: () => void}>();
const elapsed = ref(0);

watch(() => {
  return props.startedAt;
}, (startedAt, _, onCleanup) => {
  function updateElapsed() {
    elapsed.value = Math.floor((performance.now() - startedAt) / 1000);
  }
  updateElapsed();
  const clock = setInterval(updateElapsed, 1000);
  onCleanup(() => clearInterval(clock));
}, {immediate: true});
</script>

<template>
  <div class="loading preview-file-loading" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>正在加载资源…</span>
    <small v-if="elapsed >= 3" aria-live="off">
      已用 {{ elapsed }} 秒
    </small>
    <button v-if="elapsed >= 10 && retry" type="button" class="preview-retry" @click="retry">
      重新加载
    </button>
  </div>
</template>
