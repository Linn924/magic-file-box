<script setup lang="ts">
import ToolbarIcon from './ToolbarIcon.vue';
defineOptions({inheritAttrs:false});
defineProps<{icon:string;title:string;disabled?:boolean;pressed?:boolean}>();
const emit=defineEmits<{click:[event:MouseEvent]}>();
</script>
<template><span class="tool-button-wrap" :title="title"><button v-bind="$attrs" type="button" class="tool-icon-button" :title="title" :aria-label="title" :aria-pressed="pressed" :disabled="disabled" @click="emit('click',$event)"><ToolbarIcon :name="icon" /></button></span></template>
