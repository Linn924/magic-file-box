<script setup lang="ts">
import type {PdfTemporaryMark} from '@shared/contracts';
import ToolButton from '@/components/ui/ToolButton.vue';
defineProps<{notes:PdfTemporaryMark[];canExport:boolean;exporting:boolean;exportStatus:string}>();
const emit=defineEmits<{jump:[page:number];remove:[id:string];export:[]}>();
</script>
<template><aside class="pdf-notes" aria-label="本次批注"><h3>本次批注 <span>{{notes.length}}</span><ToolButton class="pdf-export-notes" icon="export" :title="exporting?'正在导出…':'导出当前页批注 PNG'" :disabled="!canExport||exporting" @click="emit('export')" /></h3><p v-if="exportStatus" class="pdf-export-status" role="status">{{exportStatus}}</p><p v-if="!notes.length" class="pdf-notes-empty">划选文字后，可在选区旁添加高亮或备注。关闭文件后批注清空；需要留存时可主动导出当前页图片。</p><article v-for="mark in notes" :key="mark.id" class="pdf-note"><div class="pdf-note-head"><button type="button" :title="'定位到第 '+mark.page+' 页'" @click="emit('jump',mark.page)">第 {{mark.page}} 页 · {{mark.kind==='note'?'备注':'高亮'}}</button><ToolButton icon="trash" :title="'删除第 '+mark.page+' 页批注'" @click="emit('remove',mark.id)" /></div><p :title="mark.quote">{{mark.quote}}</p><textarea v-if="mark.kind==='note'" v-model="mark.content" aria-label="批注内容" placeholder="写下备注（仅保存在本次预览）"></textarea></article></aside></template>
