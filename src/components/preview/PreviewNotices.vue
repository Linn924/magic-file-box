<script setup lang="ts">
defineProps<{fileName:string;messages:string[]}>();
defineEmits<{dismiss:[]}>();
</script>
<template>
  <section class="preview-notice" role="status" aria-live="polite" aria-label="预览提示">
    <header><strong>预览提示</strong><button type="button" class="preview-notice-dismiss" aria-label="关闭预览提示" title="关闭预览提示" @click="$emit('dismiss')">×</button></header>
    <small class="preview-notice-file" :title="fileName">{{fileName}}</small>
    <div class="preview-notice-content"><p v-for="message in messages" :key="message">{{message}}</p></div>
  </section>
</template>
<style scoped>
.preview-notice{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:14px;box-shadow:0 4px 20px #0003}
header{display:flex;align-items:center;gap:12px}strong{font-size:14px}.preview-notice-dismiss{margin-left:auto;border:0;background:none;display:inline-flex;align-items:center;justify-content:center;font-size:20px;line-height:20px;min-width:28px;min-height:28px;padding:0}
.preview-notice-file{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px}.preview-notice-content{max-height:220px;overflow:auto;overscroll-behavior:contain}p{margin:8px 0 0;line-height:1.5;font-size:13px;white-space:pre-line;overflow-wrap:anywhere}
</style>
