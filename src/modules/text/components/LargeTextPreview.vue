<script setup lang="ts">
import type {PreviewProps} from '@/modules/types';
import RecordPreview from '@/components/preview/RecordPreview.vue';
defineProps<PreviewProps>();const emit=defineEmits<{ready:[];error:[message:string]}>();
</script>
<template><RecordPreview :file="file" :zoom="zoom" layout="text" notice="大文件按块读取原文；超长行分段显示，保留原行号。JSON 不自动格式化，Markdown 与代码不生成完整排版或语法高亮。查找逐块扫描后续正文。" @ready="emit('ready')" @error="emit('error',$event)"/></template>
