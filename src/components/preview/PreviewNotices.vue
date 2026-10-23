<script setup lang="ts">
import {ref} from 'vue';
import {useNotificationTimeout} from '@/composables/useNotificationTimeout';
import NotificationCloseButton from '@/components/ui/NotificationCloseButton.vue';
const props=defineProps<{fileName:string;messages:string[]}>();
const emit=defineEmits<{dismiss:[]}>(),element=ref<HTMLElement>();
const timeoutEvents=useNotificationTimeout({element,visible:()=>true,content:()=>props.messages.join('\n'),dismiss:()=>emit('dismiss')});
</script>
<template>
  <section ref="element" class="preview-notice" role="status" aria-live="polite" aria-label="预览提示" v-on="timeoutEvents">
    <header><strong>预览提示</strong><NotificationCloseButton class="preview-notice-dismiss" label="关闭预览提示" @click="$emit('dismiss')"/></header>
    <small class="preview-notice-file" :title="fileName">{{fileName}}</small>
    <div class="preview-notice-content"><p v-for="message in messages" :key="message">{{message}}</p></div>
  </section>
</template>
<style scoped>
.preview-notice{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:14px;box-shadow:0 4px 20px #0003}
header{display:flex;align-items:center;gap:12px}strong{font-size:14px}.preview-notice-dismiss{margin-left:auto}
.preview-notice-file{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px}.preview-notice-content{max-height:220px;overflow:auto;overscroll-behavior:contain}p{margin:8px 0 0;line-height:1.5;font-size:13px;white-space:pre-line;overflow-wrap:anywhere}
</style>
