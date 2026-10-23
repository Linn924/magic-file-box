<script setup lang="ts">
defineProps<{suppressed?:boolean}>();
</script>
<template><div v-show="!suppressed" class="notification-stack" role="region" aria-label="通知"><slot/></div></template>
<style>
.notification-stack{position:fixed;right:0;bottom:0;z-index:25;display:flex;flex-direction:column;gap:12px;width:372px;max-width:100vw;max-height:100vh;padding:16px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;background:transparent;border:0;box-shadow:none;pointer-events:none;transition:gap 220ms ease}
.notification-stack:has(.notification-slide-enter-from,.notification-slide-leave-active){gap:0}
.notification-stack>*{flex-shrink:0;min-width:0;pointer-events:auto}.preview-notice-target{background:transparent;border:0;box-shadow:none}.preview-notice-target:empty{display:none}
.pdf-presentation-active .notification-stack{display:none!important}
@media(prefers-reduced-motion:reduce){.notification-stack{transition:none}}
</style>
