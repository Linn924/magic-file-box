<script setup lang="ts">
import {ref,computed,nextTick,watch,onBeforeUnmount} from 'vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
import ToolbarIcon from '@/components/ui/ToolbarIcon.vue';
import * as XLSX from 'xlsx';
import type {useEditor} from '../composables/useEditor';
import {parseTableRange,type SortKey} from '../core/editing/tableModel';
import {filterChoices,readFilterInfo,type FilterInfo} from '../core/workbook/filterWorkbook';
const props=defineProps<{fileId:string;editor:ReturnType<typeof useEditor>;sheet:string;book?:XLSX.WorkBook;prepare:()=>boolean}>();
const mode=ref<'sort'|'filter'|null>(null),panel=ref<HTMLElement>(),trigger=ref<HTMLElement>(),rangeText=ref(''),header=ref(true),keys=ref<SortKey[]>([]),column=ref(0),loading=ref(false),error=ref(''),filter=ref<FilterInfo>(),choices=ref<Array<{text:string;count:number}>>([]),selected=ref<string[]>([]),query=ref('');
let generation=0;
const disabled=computed(()=>props.editor.saving.value||loading.value);
const range=computed(()=>{try{return parseTableRange(rangeText.value);}catch{return undefined;}});
const columns=computed(()=>range.value?Array.from({length:range.value.e.c-range.value.s.c+1},(_,i)=>range.value!.s.c+i):[]);
const shown=computed(()=>choices.value.filter(c=>c.text.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())));
function label(c:number){const value=range.value?props.book?.Sheets[props.sheet]?.[XLSX.utils.encode_cell({r:range.value.s.r,c})]:undefined;return XLSX.utils.encode_col(c)+(header.value&&value?.v!==undefined?' · '+String(value.v).slice(0,40):'');}
function close(){if(props.editor.saving.value)return;generation++;mode.value=null;loading.value=false;error.value='';void nextTick(()=>trigger.value?.isConnected&&trigger.value.focus({preventScroll:true}));}
async function show(next:'sort'|'filter',event:MouseEvent){if(disabled.value||!props.prepare())return;trigger.value=event.currentTarget as HTMLElement;rangeText.value=props.book?.Sheets[props.sheet]?.['!ref']||'A1:B2';header.value=true;keys.value=[{column:XLSX.utils.decode_range(rangeText.value).s.c,direction:'asc'}];column.value=keys.value[0].column;error.value='';mode.value=next;query.value='';selected.value=[];choices.value=[];filter.value=undefined;
  if(next==='filter'){const token=++generation;loading.value=true;try{const bytes=await props.editor.dataBytes(),info=await readFilterInfo(bytes,props.sheet);if(token!==generation)return;filter.value=info;if(info)rangeText.value=XLSX.utils.encode_range(info.range);column.value=parseTableRange(rangeText.value).s.c;}catch(e){if(token===generation)error.value=(e as Error).message;}finally{if(token===generation)loading.value=false;}if(token===generation&&!error.value)await readChoices();}
  await nextTick();panel.value?.querySelector<HTMLInputElement>('input')?.focus();
}
async function readChoices(){const token=++generation;loading.value=true;error.value='';try{const r=parseTableRange(rangeText.value);if(r.s.r===r.e.r)throw Error('区域需包含标题和数据行。');if(column.value<r.s.c||column.value>r.e.c)column.value=r.s.c;const bytes=await props.editor.dataBytes(),list=await filterChoices(bytes,props.sheet,r,column.value);if(token!==generation)return;choices.value=list;const prior=filter.value?.conditions.find(c=>c.column===column.value);selected.value=prior?[...prior.values,...(prior.blank?['']:[])]:list.map(c=>c.text);}catch(e){if(token===generation)error.value=(e as Error).message;}finally{if(token===generation)loading.value=false;}}
async function apply(clear=false){error.value='';try{const r=clear&&filter.value?filter.value.range:parseTableRange(rangeText.value);let ok:boolean;if(mode.value==='sort')ok=await props.editor.sortTable(r,header.value,keys.value);else {const conditions=(filter.value?.conditions||[]).filter(c=>c.column!==column.value);if(!clear)conditions.push({column:column.value,values:selected.value.filter(v=>v!==''),blank:selected.value.includes('')});ok=await props.editor.filterTable(r,conditions,clear);}if(ok){await nextTick();close();}}catch(e){error.value=(e as Error).message;}}
function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){const fields=Array.from(panel.value?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)')||[]),index=fields.indexOf(document.activeElement as HTMLElement);if(!fields.length){event.preventDefault();return;}if(event.shiftKey&&index<=0){event.preventDefault();fields.at(-1)?.focus();}else if(!event.shiftKey&&(index<0||index===fields.length-1)){event.preventDefault();fields[0]?.focus();}}}
let inertNodes:HTMLElement[]=[];
function release(){for(const el of inertNodes)el.inert=false;inertNodes=[];}
watch(mode,async value=>{release();if(!value)return;await nextTick();if(!mode.value)return;const excel=panel.value?.closest('.excel');for(const child of [...Array.from(excel?.children||[]),document.querySelector(`[data-file-id='${props.fileId}'] .module-tools`)])if(child instanceof HTMLElement&&!child.contains(panel.value!)&&!child.inert){child.inert=true;inertNodes.push(child);}});
watch(()=>props.sheet,()=>{if(mode.value&&!props.editor.saving.value)close();});
onBeforeUnmount(()=>{generation++;release();});
</script>
<template>
  <span class="excel-command-group" data-group="data">
    <button class="tool-icon-button excel-sort-toggle" title="排序（整行关联、多列优先级）" aria-label="排序（整行关联、多列优先级）" :disabled="disabled" @click="show('sort',$event)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 2v12m-3-3 3 3 3-3M10 3h5M10 7h3M10 11h1"/></svg></button>
    <button class="tool-icon-button excel-filter-toggle" title="按值筛选、空值筛选与清除筛选" aria-label="按值筛选、空值筛选与清除筛选" :disabled="disabled" @click="show('filter',$event)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M2 2h12L9 8v5l-2 1V8L2 2Z"/></svg></button>
    <select v-model="editor.copyRows.value" class="excel-copy-scope" aria-label="复制及文本导出范围" title="全部行含隐藏行；仅可见行复制显示值。此导出范围仅用于 CSV/TSV，Excel 副本始终保留全部行。" :disabled="editor.saving.value"><option value="all">复制/导出全部行</option><option value="visible">复制/导出可见行</option></select>
  </span>
  <Teleport :to="`[data-file-id='${fileId}'] .excel`" defer>
    <PopupTransition>
    <div v-if="mode" class="excel-sheet-overlay" @pointerdown.self="close">
      <form ref="panel" class="excel-sheet-dialog excel-data-dialog" role="dialog" aria-modal="true" :aria-label="mode==='sort'?'排序':'筛选'" @submit.prevent="apply()" @keydown="key">
        <strong>{{mode==='sort'?'排序':'按值筛选'}}</strong>
        <div class="excel-data-body">
        <label>区域<input v-model="rangeText" aria-label="数据区域" placeholder="A1:D20" :disabled="disabled" @change="mode==='filter'&&readChoices()" required/></label>
        <template v-if="mode==='sort'">
          <label class="excel-data-check"><input v-model="header" type="checkbox" aria-label="首行为标题" :disabled="disabled"/>首行为标题，不参与排序</label>
          <div v-for="(sort,i) in keys" :key="i" class="excel-sort-key"><select v-model.number="sort.column" :aria-label="'排序列 '+(i+1)" :disabled="disabled"><option v-for="c in columns" :key="c" :value="c">{{label(c)}}</option></select><select v-model="sort.direction" :aria-label="'排序方向 '+(i+1)" :disabled="disabled"><option value="asc">升序</option><option value="desc">降序</option></select><button type="button" class="icon-only-btn" title="删除此排序条件" aria-label="删除此排序条件" :disabled="disabled||keys.length===1" @click="keys.splice(i,1)"><ToolbarIcon name="cancel" /></button></div>
          <button type="button" class="excel-sort-add" :disabled="disabled||keys.length>=8||keys.length>=columns.length" @click="keys.push({column:columns.find(c=>!keys.some(k=>k.column===c))!,direction:'asc'})">添加排序条件</button>
          <p>按以上优先级排序全部数据行，同行内容、公式、样式、行高及手动隐藏随行移动。区域必须覆盖这些行的全部非空列。</p>
          <small>升序：数字/日期 → 文本 → 布尔 → 错误；降序反转，空值始终最后。相同值保持原顺序。无法安全移动的合并、对象或公式提前拒绝。</small>
        </template>
        <template v-else>
          <small>首行为标题。列内多值为“或”，不同列条件为“且”；清除筛选保留手动隐藏。编辑内容后可重新应用筛选。</small>
          <label>筛选列<select v-model.number="column" aria-label="筛选列" :disabled="disabled" @change="readChoices"><option v-for="c in columns" :key="c" :value="c">{{label(c)}}</option></select></label>
          <input v-model="query" aria-label="筛选值查询" placeholder="查找筛选值" :disabled="disabled"/>
          <div class="excel-filter-controls"><button type="button" :disabled="disabled" @click="selected=choices.map(c=>c.text)">全选</button><button type="button" :disabled="disabled" @click="selected=[]">全部取消</button><span>{{selected.length}} / {{choices.length}} 项</span></div>
          <div class="excel-filter-values"><label v-for="choice in shown" :key="choice.text"><input v-model="selected" type="checkbox" :value="choice.text" :disabled="disabled"/><span>{{choice.text||'（空值）'}}</span><small>{{choice.count}}</small></label><p v-if="loading">读取中…</p><p v-else-if="!shown.length">没有匹配值</p></div>
          <p v-if="filter?.conditions.length">当前有 {{filter.conditions.length}} 列条件，筛选排除 {{filter.excluded.length}} 行；手动隐藏 {{filter.manual.length}} 行。</p>
          <small>XLSX 保存条件和隐藏状态；XLS 含活动条件时需改存 XLSX。Excel 副本包含全部行；仅可见行的 CSV/TSV 不会将完整草稿标记为已保存。</small>
        </template>
        </div>
        <p v-if="error||editor.error.value" class="excel-edit-error" role="alert">{{error||editor.error.value}}</p>
        <div class="excel-sheet-submit"><button v-if="mode==='filter'" type="button" class="excel-filter-clear" :disabled="disabled||!filter" @click="apply(true)">清除筛选</button><button type="button" data-cancel :disabled="editor.saving.value" @click="close">取消</button><button class="excel-data-apply" type="submit" :disabled="disabled||!range">{{disabled?'处理中…':mode==='sort'?'排序':'应用筛选'}}</button></div>
        <small>仅修改本次副本草稿，可撤销；源文件保持原样。</small>
      </form>
    </div>
    </PopupTransition>
  </Teleport>
</template>
