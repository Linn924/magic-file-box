<script setup lang="ts">
import {ref,nextTick} from 'vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
import {formulaFunctions,parseFormula} from '../core/formula/formula';
defineProps<{disabled:boolean}>();
const emit=defineEmits<{insert:[formula:string]}>();
const open=ref(false),name=ref('VLOOKUP'),args=ref<string[]>([]),error=ref(''),dialog=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>();
const labels:Record<string,string[]>={VLOOKUP:['查找值或单元格','查找区域（首列为查找列）','返回第几列','近似匹配（FALSE 精确 / TRUE 近似）'],ROUND:['数值或单元格','小数位数（负数舍入整数位）'],ROUNDUP:['数值或单元格','小数位数'],ROUNDDOWN:['数值或单元格','小数位数'],ABS:['数值或单元格'],IF:['判断条件','条件成立时','条件不成立时']};
function reset(){args.value=name.value==='VLOOKUP'?['','','2','FALSE']:name.value.startsWith('ROUND')?['','2']:name.value==='IF'?['','','']:[''];error.value='';}
async function show(){reset();open.value=true;await nextTick();dialog.value?.querySelector<HTMLInputElement>('input')?.focus();}
async function close(){open.value=false;await nextTick();trigger.value?.focus({preventScroll:true});}
function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();void close();}if(event.key==='Tab'){const nodes=Array.from(dialog.value?.querySelectorAll<HTMLElement>('button,input,select')||[]).filter(node=>!node.hasAttribute('disabled'));const at=nodes.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&at<=0||!event.shiftKey&&at===nodes.length-1){event.preventDefault();nodes[event.shiftKey?nodes.length-1:0]?.focus();}}}
async function insert(){try{if(args.value.some(arg=>!arg.trim()))throw Error('请填写所有参数；文本请用双引号包围。');const formula=name.value+'('+args.value.join(',')+')';parseFormula(formula);emit('insert','='+formula);open.value=false;}catch(e){error.value=(e as Error).message;}}
</script>
<template>
  <button ref="trigger" class="tool-icon-button excel-formula-label" :disabled="disabled" title="插入常用公式" aria-label="插入常用公式" aria-haspopup="dialog" @click="show"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M14 4c-4-2-5 1-5.5 4L7 18c-.4 3-2 3-4 2M5 10h8M15 12l6 8m0-8-6 8" /></svg></button>
  <PopupTransition><div v-if="open" class="excel-insert-overlay" @mousedown.self="close" @keydown="key">
    <form ref="dialog" class="excel-insert-dialog excel-formula-dialog" role="dialog" aria-modal="true" aria-label="插入常用公式" @submit.prevent="insert">
      <h3>插入常用公式</h3>
      <label>函数<select v-model="name" aria-label="公式函数" @change="reset"><option v-for="fn in formulaFunctions" :key="fn.name" :value="fn.name">{{fn.name}} · {{fn.label}}</option></select></label>
      <label v-for="(_,i) in args" :key="i">{{labels[name]?.[i]||'数值、引用或区域（多项用逗号分隔）'}}<input v-model="args[i]" :aria-label="'公式参数 '+(i+1)" autocomplete="off" /></label>
      <small>文本需加双引号，例如 "苹果"。{{name==='VLOOKUP'?'近似匹配要求首列按升序排列。':''}}</small>
      <div v-if="error" class="excel-edit-error" role="alert">{{error}}</div>
      <footer><button type="button" @click="close">取消</button><button type="submit">填入公式</button></footer>
    </form>
  </div></PopupTransition>
</template>
<style scoped>
.excel-formula-dialog{display:block;box-sizing:border-box;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto}.excel-formula-dialog h3{margin:0 0 16px}.excel-formula-dialog label{display:block;margin:12px 0}.excel-formula-dialog label input,.excel-formula-dialog label select{display:block;width:100%;box-sizing:border-box;margin-top:6px}.excel-formula-dialog small{display:block;color:var(--muted);line-height:1.5}.excel-formula-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
</style>
