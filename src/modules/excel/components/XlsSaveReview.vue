<script setup lang="ts">
import {ref,onMounted,nextTick,useId} from 'vue';
import type {XlsWarning} from '../core/workbook/xlsCompatibility';
defineProps<{warnings:XlsWarning[];format:string}>();
const emit=defineEmits<{answer:[accept:boolean]}>();
const dialog=ref<HTMLElement>(),cancel=ref<HTMLButtonElement>();
const titleId=useId();
onMounted(()=>void nextTick(()=>cancel.value?.focus()));
function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();emit('answer',false);}else if(event.key==='Tab'){const buttons=Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>('button')||[]);if(event.shiftKey&&document.activeElement===buttons[0]||!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0]?.focus();}}}
</script>
<template>
  <div class="excel-insert-overlay" @keydown="key">
    <section ref="dialog" class="excel-insert-dialog xls-save-review" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <h3 :id="titleId">另存 {{format.toUpperCase()}} 前请确认</h3>
      <p>源文件中检测到以下兼容性事项：</p>
      <ul><li v-for="item in warnings" :key="item.id"><strong>{{item.label}}<span>{{item.kind==='approximate'?' · 近似还原':item.kind==='unknown'?' · 无法确认完整性':' · 不保留'}}</span></strong><p>{{item.detail}}</p><small v-if="item.locations.length">涉及：{{item.locations.join('、')}}</small></li></ul>
      <p class="xls-review-note">支持保留常见字体、边框、图案填充和基本布局。此检查不保证覆盖全部旧格式特性。源文件不会被修改；取消后保留编辑草稿。</p>
      <footer><button ref="cancel" type="button" @click="emit('answer',false)">取消</button><button class="xls-save-continue" type="button" @click="emit('answer',true)">仍然另存副本</button></footer>
    </section>
  </div>
</template>
<style scoped>
.xls-save-review{display:block;box-sizing:border-box;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto}.xls-save-review h3{margin:0 0 14px}.xls-save-review p{font-size:12px;line-height:1.6}.xls-save-review ul{padding:0;list-style:none}.xls-save-review li{padding:12px 0;border-bottom:1px solid var(--line)}.xls-save-review li p{margin:5px 0}.xls-save-review strong span,.xls-review-note{color:var(--muted)}.xls-save-review footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
</style>
