<script setup lang="ts">
import type {PreviewProps} from '@/modules/types';
import RecordPreview from '@/components/preview/RecordPreview.vue';
defineProps<PreviewProps>();const emit=defineEmits<{ready:[];error:[message:string]}>();
</script>
<template><RecordPreview :file="file" :zoom="zoom" layout="table" :notice="file.ext==='xlsx'?'大型工作簿按工作表读取单元格数据，省略空白行；此模式不还原完整样式、图表和图片，不提供编辑、另存与打印。查找当前列组中的后续数据。':'大型 CSV/TSV 按记录读取，保留引号、跨行字段及文本标识符；此模式只读，不提供编辑与导出。查找当前列组中的后续数据。'" @ready="emit('ready')" @error="emit('error',$event)"/></template>
