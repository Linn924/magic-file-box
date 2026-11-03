<script setup lang="ts">
import type {PreviewProps} from '@/modules/types';
import RecordPreview from '@/components/preview/RecordPreview.vue';
defineProps<PreviewProps>();const emit=defineEmits<{ready:[];error:[message:string]}>();
</script>
<template><RecordPreview :file="file" :zoom="zoom" layout="document" :search="false" notice="大型 PPTX 按幻灯片读取文字和按需图片；此模式不还原对象坐标、复杂版式、动画、音视频与母版背景。未选择的幻灯片、图片和附件不整体解压。" @ready="emit('ready')" @error="emit('error',$event)"/></template>
