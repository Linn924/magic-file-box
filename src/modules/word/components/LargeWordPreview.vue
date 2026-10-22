<script setup lang="ts">
import type {PreviewProps} from '@/modules/types';
import RecordPreview from '@/components/preview/RecordPreview.vue';
defineProps<PreviewProps>();const emit=defineEmits<{ready:[];error:[message:string]}>();
</script>
<template><RecordPreview :file="file" :zoom="zoom" layout="document" notice="大型 DOCX 按段落读取正文、标题和按需图片；表格按文字顺序显示，此模式不还原原始分页、复杂版式、页眉页脚与脚注，不提供打印。单张图片仍受解码与读取预算保护。" @ready="emit('ready')" @error="emit('error',$event)"/></template>
