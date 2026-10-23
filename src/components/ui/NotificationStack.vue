<script setup lang="ts">
defineProps<{suppressed?:boolean}>();
</script>
<template><div v-show="!suppressed" class="notification-stack" role="region" aria-label="通知"><slot/></div></template>
<style>
.notification-stack{position:fixed;right:16px;bottom:16px;z-index:25;display:flex;flex-direction:column;gap:12px;width:340px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;overscroll-behavior:contain}
.notification-stack>*{flex-shrink:0;min-width:0}.preview-notice-target:empty{display:none}
.pdf-presentation-active .notification-stack{display:none!important}
</style>
