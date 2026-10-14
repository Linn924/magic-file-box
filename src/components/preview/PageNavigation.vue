<script setup lang="ts">
defineProps<{ current: number; total: number; label?: string }>();
const emit = defineEmits<{ jump: [page: number] }>();
function jump(event: Event) {
  emit("jump", Number((event.target as HTMLInputElement).value) || 1);
}
</script>
<template>
  <footer class="page-nav">
    <span v-if="label" class="page-nav-label">{{ label }}</span>
    <div>
      <button
        type="button"
        class="icon-only-btn"
        :disabled="current <= 1"
        title="上一页"
        aria-label="上一页"
        @click="emit('jump', current - 1)"
      >
        <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.5 3.5L6 8l4.5 4.5" />
        </svg>
        <span class="sr-only">上一页</span></button
      ><label class="page-indicator"
        ><input
          aria-label="页码"
          type="number"
          min="1"
          :max="total"
          :value="current"
          @change="jump"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        / {{ total }}</label
      ><button
        type="button"
        class="icon-only-btn"
        :disabled="current >= total"
        title="下一页"
        aria-label="下一页"
        @click="emit('jump', current + 1)"
      >
        <svg class="btn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5.5 3.5L10 8l-4.5 4.5" />
        </svg>
        <span class="sr-only">下一页</span>
      </button>
    </div>
  </footer>
</template>
