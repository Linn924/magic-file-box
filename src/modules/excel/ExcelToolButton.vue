<script setup lang="ts">
import ExcelIcon from './ExcelIcon.vue';
defineOptions({inheritAttrs:false});
defineProps<{icon:string;title:string;disabled?:boolean;pressed?:boolean}>();
const emit=defineEmits<{click:[event:MouseEvent]}>();
</script>
<template><span class="excel-tool-wrap" :title="title"><button v-bind="$attrs" type="button" class="excel-icon-button" :title="title" :aria-label="title" :aria-pressed="pressed" :disabled="disabled" @click="emit('click',$event)"><ExcelIcon :name="icon" /></button></span></template>
