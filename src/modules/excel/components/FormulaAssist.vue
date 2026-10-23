<script setup lang="ts">
import type {useFormulaAssist} from '../composables/useFormulaAssist';
import {parameters} from '../core/formula/formulaAssist';
defineProps<{assist:ReturnType<typeof useFormulaAssist>}>();
</script>
<template><div v-if="assist.target.value&&(assist.suggestions.value.length||assist.call.value)" class="excel-formula-assist" :style="{left:assist.position.value.left+'px',top:assist.position.value.top+'px'}" @pointerdown.prevent>
  <div v-if="assist.suggestions.value.length" role="listbox" aria-label="公式自动补全"><button v-for="(fn,i) in assist.suggestions.value" :key="fn.name" role="option" :aria-selected="i===assist.suggestion.value" @click="assist.accept(fn.name)"><strong>{{fn.name}}</strong><span>{{fn.label}}</span></button></div>
  <small v-if="assist.call.value">{{assist.call.value.name}}（<template v-for="(label,i) in parameters[assist.call.value.name]" :key="i"><b v-if="i===assist.call.value.argument||parameters[assist.call.value.name].length===1">{{label}}</b><span v-else>{{label}}</span>{{i<parameters[assist.call.value.name].length-1?'，':''}}</template>）</small>
</div></template>
<style scoped>
.excel-formula-assist{position:fixed;z-index:40;width:320px;max-width:calc(100vw - 16px);background:var(--panel);border:1px solid var(--line);border-radius:6px;box-shadow:0 4px 16px #0003;overflow:auto;max-height:180px}.excel-formula-assist button{display:flex;justify-content:flex-start;width:100%;border:0;border-radius:0;gap:14px;text-align:left}.excel-formula-assist button[aria-selected=true]{background:var(--well);color:var(--accent)}.excel-formula-assist small{display:block;padding:8px;line-height:1.5;color:var(--muted)}.excel-formula-assist b{color:var(--accent)}
</style>
