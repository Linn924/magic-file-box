<script setup lang="ts">
import {computed,ref,nextTick,onBeforeUnmount,watch} from 'vue';
import type {WorkBook} from 'xlsx';
import ToolButton from '@/components/ui/ToolButton.vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
import {nextSheetName,validateSheetName,type SheetOperation} from '../core/workbook/sheetWorkbook';
import {visibleSheetNames} from '../core/editing/sheetState';
import {parseFormula,formulaReferences} from '../core/formula/formula';
const props=defineProps<{fileId:string;book?:WorkBook;sheet:string;disabled:boolean;prepare:()=>boolean;apply:(op:SheetOperation)=>Promise<boolean>;message:string}>();
const panel=ref<HTMLElement>(),trigger=ref<HTMLElement>(),open=ref(false),kind=ref<SheetOperation['kind']>('rename'),name=ref(''),target=ref(''),index=ref(0),error=ref('');
const names=computed(()=>props.book?.SheetNames||[]),visible=computed(()=>visibleSheetNames(props.book)),hidden=computed(()=>names.value.filter(n=>!visible.value.includes(n)));
const indexOf=computed(()=>names.value.indexOf(props.sheet));
const impact=computed(()=>{if(!props.book)return '';const ws=props.book.Sheets[props.sheet],used=Object.keys(ws||{}).filter(k=>!k.startsWith('!')&&(ws[k]?.v!==undefined||ws[k]?.f)).length;let refs=0,unknown=0;for(const other of names.value)if(other!==props.sheet)for(const [addr,cell] of Object.entries(props.book.Sheets[other]))if(!addr.startsWith('!')&&cell?.f){try{if(formulaReferences(parseFormula(cell.f)).some(r=>r.sheet?.toLowerCase()===props.sheet.toLowerCase()))refs++;}catch{unknown++;}}return `“${props.sheet}”有 ${used} 个非空单元格，其他工作表有 ${refs} 个公式引用它。删除后这些引用显示 #REF!，可撤销。${unknown?'另有无法安全调整的公式，本次操作将拒绝。':''}`;});
function close(){if(props.disabled)return;open.value=false;error.value='';void nextTick(()=>trigger.value?.isConnected?trigger.value.focus({preventScroll:true}):document.querySelector<HTMLButtonElement>('.excel-sheets-toggle')?.focus({preventScroll:true}));}
function show(action:SheetOperation['kind'],event:MouseEvent){if(props.disabled||!props.prepare())return;trigger.value=event.currentTarget as HTMLElement;kind.value=action;name.value=action==='create'?nextSheetName(names.value):action==='copy'?nextSheetName(names.value,props.sheet):props.sheet;target.value=hidden.value[0]||'';index.value=indexOf.value;error.value='';open.value=true;void nextTick(()=>panel.value?.querySelector<HTMLElement>(action==='delete'?'[data-cancel]':'input,select')?.focus());}
async function submit(){
  error.value='';let op:SheetOperation;
  try{if(kind.value==='create'||kind.value==='copy'||kind.value==='rename'){validateSheetName(name.value,names.value,kind.value==='rename'?props.sheet:undefined);op={kind:kind.value,sheet:props.sheet,name:name.value};}
    else if(kind.value==='move')op={kind:'move',sheet:props.sheet,index:Number(index.value)};
    else op={kind:kind.value as 'delete'|'hide'|'show',sheet:kind.value==='show'?target.value:props.sheet};
    if(await props.apply(op)){await nextTick();close();}
  }catch(e){error.value=(e as Error).message;}
}
function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){const fields=Array.from(panel.value?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)')||[]);if(!fields.length){event.preventDefault();return;}const at=fields.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&at<=0){event.preventDefault();fields.at(-1)?.focus();}else if(!event.shiftKey&&(at<0||at===fields.length-1)){event.preventDefault();fields[0]?.focus();}}}
let inertNodes:HTMLElement[]=[];
function release(){for(const n of inertNodes)n.inert=false;inertNodes=[];}
watch(open,async value=>{release();if(!value)return;await nextTick();if(!open.value)return;const excel=panel.value?.closest('.excel');const children=[...Array.from(excel?.children||[]),document.querySelector(`[data-file-id='${props.fileId}'] .module-tools`)];for(const child of children)if(child instanceof HTMLElement&&!child.contains(panel.value!)){if(!child.inert){child.inert=true;inertNodes.push(child);}}});
onBeforeUnmount(release);
watch(kind,action=>{if(action==='delete')void nextTick(()=>panel.value?.querySelector<HTMLElement>('[data-cancel]')?.focus());});
const titles={create:'新建工作表',copy:'复制工作表',rename:'重命名工作表',delete:'删除工作表',move:'调整工作表顺序',hide:'隐藏工作表',show:'取消隐藏工作表'};
</script>
<template>
  <span class="excel-sheet-actions">
    <ToolButton class="excel-sheet-add" icon="plus" title="新建工作表" :disabled="disabled" @click="show('create',$event)"/>
    <ToolButton class="excel-sheets-toggle" icon="layout" title="管理工作表" :disabled="disabled" @click="show('rename',$event)"/>
  </span>
  <Teleport :to="`[data-file-id='${fileId}'] .excel`" defer>
    <PopupTransition>
    <div v-if="open" class="excel-sheet-overlay" @pointerdown.self="close">
      <form ref="panel" class="excel-sheet-dialog" role="dialog" aria-modal="true" aria-label="工作表管理" @submit.prevent="submit" @keydown="key">
        <strong>{{titles[kind]}}</strong>
        <nav class="excel-sheet-modes" aria-label="工作表操作"><button v-for="action in ['rename','copy','move','hide','show','delete'] as const" :key="action" type="button" :disabled="disabled||(action==='show'&&!hidden.length)||(action==='hide'&&visible.length===1)||(action==='delete'&&(names.length===1||visible.length===1&&visible.includes(sheet)))" :aria-pressed="kind===action" @click="kind=action;name=action==='copy'?nextSheetName(names,sheet):sheet;target=hidden[0]||'';index=indexOf;error=''">{{titles[action]}}</button></nav>
        <label v-if="['create','copy','rename'].includes(kind)">工作表名称<input v-model="name" aria-label="工作表名称" :disabled="disabled" maxlength="31" required autocomplete="off"/></label>
        <label v-if="kind==='show'">隐藏的工作表<select v-model="target" aria-label="隐藏的工作表" :disabled="disabled"><option v-for="n in hidden" :key="n" :value="n">{{n}}</option></select></label>
        <label v-if="kind==='move'">移动到<select v-model.number="index" aria-label="工作表位置" :disabled="disabled"><option v-for="(n,i) in names" :key="n" :value="i">第 {{i+1}} 位 · {{n}}</option></select></label>
        <p v-if="kind==='delete'" class="excel-sheet-impact">{{impact}}</p>
        <p v-if="kind==='hide'">隐藏“{{sheet}}”，保留内容和公式引用。至少保留一个可见工作表。</p>
        <p v-if="kind==='copy'">复制内容、格式、尺寸、合并及普通图片、超链接和备注。复制后的本表引用指向新工作表。</p>
        <p v-if="error||message" class="excel-edit-error" role="alert">{{error||message}}</p>
        <div class="excel-sheet-submit"><button type="button" data-cancel :disabled="disabled" @click="close">取消</button><button class="excel-sheet-confirm" type="submit" :disabled="disabled||(kind==='show'&&!target)">{{disabled?'处理中…':titles[kind]}}</button></div>
        <small>本次修改仅在内存中，可撤销；主动另存 Excel 副本才保存全部工作表。</small>
      </form>
    </div>
    </PopupTransition>
  </Teleport>
</template>
