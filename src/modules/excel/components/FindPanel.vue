<script setup lang="ts">
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import type {useFind} from '../composables/useFind';
import * as XLSX from 'xlsx';
defineProps<{find:ReturnType<typeof useFind>;fileId:string;editing:boolean;disabled:boolean}>();
</script>
<template>
  <PreviewPanel v-model:open="find.open.value" title="查找与替换" :target="`[data-file-id='${fileId}'] .floating-tools`" trigger=".excel-find-toggle" close-label="关闭查找">
    <div class="excel-find-panel">
      <label>查找<input v-model="find.query.value" aria-label="查找内容" maxlength="4096" @keydown.enter.prevent="find.navigate($event.shiftKey?-1:1)"/></label>
      <div class="excel-find-options"><label>范围<select v-model="find.scope.value" aria-label="查找范围"><option value="sheet">当前工作表</option><option v-if="editing" value="selection">打开面板时的选区</option></select></label><label>查找位置<select v-model="find.source.value" aria-label="查找位置"><option value="display">显示内容</option><option value="expression">公式表达式 / 原始值</option></select></label></div>
      <div class="excel-find-options"><label><input v-model="find.caseSensitive.value" type="checkbox"/>区分大小写</label><label><input v-model="find.whole.value" type="checkbox"/>匹配整个单元格</label></div>
      <small v-if="find.scope.value==='selection'&&find.fixedRange.value">固定范围 {{XLSX.utils.encode_range(find.fixedRange.value)}} <button @click="find.capture" :disabled="disabled">使用当前选区</button></small>
      <div class="excel-find-nav"><span role="status">{{find.busy.value?'查找中…':`${find.index.value+1} / ${find.hits.value.length} 格`}}</span><ToolButton icon="up" title="上一个匹配单元格（Shift+Enter）" :disabled="find.busy.value||!find.hits.value.length||disabled" @click="find.navigate(-1)"/><ToolButton icon="down" title="下一个匹配单元格（Enter）" :disabled="find.busy.value||!find.hits.value.length||disabled" @click="find.navigate(1)"/></div>
      <template v-if="editing"><label>替换为<input v-model="find.replacement.value" aria-label="替换内容" maxlength="32767" :disabled="disabled"/></label><div class="excel-find-nav"><button class="excel-replace-one" :disabled="disabled||find.busy.value||!find.hits.value.length||find.limited.value" @click="find.replace()">替换当前</button><button class="excel-replace-all" :disabled="disabled||find.busy.value||!find.hits.value.length||find.limited.value" @click="find.replace(true)">全部替换（{{find.hits.value.length}} 格）</button></div><small>文本保持文本类型；公式请在表达式模式替换。全部替换为一次撤销。</small></template>
      <p v-if="find.message.value" role="status">{{find.message.value}}</p>
    </div>
  </PreviewPanel>
</template>
<style scoped>
.excel-find-panel{width:320px;max-width:100%;display:grid;gap:10px}.excel-find-panel>label{display:grid;gap:4px}.excel-find-panel input:not([type=checkbox]){width:100%;box-sizing:border-box}.excel-find-options,.excel-find-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.excel-find-options label{display:flex;gap:4px;align-items:center}.excel-find-options select{max-width:170px}.excel-find-nav span{margin-right:auto}.excel-find-panel small{color:var(--muted);line-height:1.5}.excel-find-panel p{margin:0;color:var(--danger)}
</style>
