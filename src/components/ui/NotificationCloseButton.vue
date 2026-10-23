<script setup lang="ts">
import ToolbarIcon from './ToolbarIcon.vue';
defineProps<{label:string;title?:string}>();
defineEmits<{click:[event:MouseEvent]}>();
</script>
<template><button type="button" class="notification-close" :aria-label="label" :title="title||label" @click="$emit('click',$event)"><ToolbarIcon name="cancel"/></button></template>
<style scoped>
.notification-close{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;min-width:28px;min-height:28px;margin:0;padding:0;border:0;background:transparent;line-height:1}
.notification-close :deep(svg){display:block;width:16px;height:16px;margin:0}
</style>
