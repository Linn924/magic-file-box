<script setup lang="ts">
import {ref,nextTick,useId} from 'vue';
import PopupTransition from '@/components/ui/PopupTransition.vue';
import {validateFormat,type FormatPatch} from '../core/editing/formatModel';
const props=defineProps<{disabled:boolean;prepare:()=>boolean;styles:()=>any[];apply:(patch:FormatPatch)=>Promise<boolean>;message:string}>();
const opened=ref(false),tab=ref('font'),dialog=ref<HTMLElement>(),trigger=ref<HTMLButtonElement>(),localError=ref(''),patch=ref<FormatPatch>({}),values=ref<Record<string,any>>({}),titleId=useId();
const families=['Microsoft YaHei','宋体','黑体','等线','Arial','Calibri','Times New Roman','Consolas'];
async function open(){if(!props.prepare())return;try{const styles=props.styles(),same=(path:string,defaultValue?:any)=>{const read=(style:any)=>path.split('.').reduce((node,key)=>node?.[key],style)??defaultValue,first=read(styles[0]);return styles.every(s=>JSON.stringify(read(s))===JSON.stringify(first))?first:undefined;};values.value={fontColor:same('font.color.argb'),fillColor:same('fill.fgColor.argb'),name:same('font.name'),size:same('font.size'),bold:same('font.bold',false),italic:same('font.italic',false),underline:same('font.underline',false),strike:same('font.strike',false),vertical:same('alignment.vertical','bottom'),horizontal:same('alignment.horizontal'),wrapText:same('alignment.wrapText',false),indent:same('alignment.indent',0),rotation:same('alignment.textRotation',0),numFmt:same('numFmt','General')};patch.value={};localError.value='';opened.value=true;await nextTick();dialog.value?.querySelector<HTMLElement>('input,select,button')?.focus();}catch(e){localError.value=(e as Error).message;opened.value=true;}}
async function close(){if(props.disabled)return;opened.value=false;await nextTick();trigger.value?.focus({preventScroll:true});}
function font(key:string,value:any){patch.value.font={...patch.value.font,[key]:value};values.value[key]=value;}
function align(key:string,value:any){patch.value.alignment={...patch.value.alignment,[key]:value};values.value[key==='textRotation'?'rotation':key]=value;}
function border(key:string,value:any){patch.value.border={preset:'all',style:'thin',color:'000000',...patch.value.border,[key]:value};}
async function submit(){try{validateFormat(patch.value);if(!Object.keys(patch.value).length){await close();return;}if(await props.apply(patch.value)){await nextTick();await close();}}catch(e){localError.value=(e as Error).message;}}
function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void close();}else if(event.key==='Tab'){const nodes=Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')||[]).filter(n=>n.offsetParent!==null);if(event.shiftKey&&document.activeElement===nodes[0]||!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[event.shiftKey?nodes.length-1:0]?.focus();}}}
</script>
<template>
  <button ref="trigger" class="tool-icon-button excel-format-toggle" :disabled="disabled" title="设置单元格格式" aria-label="设置单元格格式" aria-haspopup="dialog" @click="open"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m4 17 6-13 6 13M6 13h8M3 21h15M18 4h3m-3 5h3m-3 5h3" /></svg></button>
  <PopupTransition><div v-if="opened" class="excel-insert-overlay" @keydown="key">
    <form ref="dialog" class="excel-insert-dialog excel-format-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" @submit.prevent="submit">
      <h3 :id="titleId">单元格格式</h3>
      <nav role="tablist" aria-label="格式类别"><button v-for="item in [{id:'font',label:'字体与颜色'},{id:'border',label:'边框'},{id:'alignment',label:'对齐'},{id:'number',label:'数字'}]" :key="item.id" type="button" role="tab" :aria-selected="tab===item.id" :disabled="disabled" @click="tab=item.id">{{item.label}}</button></nav>
      <fieldset :disabled="disabled">
        <section v-if="tab==='font'">
          <label>字体<input list="excel-font-families" :value="values.name" aria-label="字体名称" placeholder="保持原值 / 混合" @input="font('name',($event.target as HTMLInputElement).value)" /></label><datalist id="excel-font-families"><option v-for="name in families" :key="name" :value="name" /></datalist>
          <label>字号<input type="number" min="1" max="409" :value="values.size" aria-label="字号" placeholder="保持原值 / 混合" @input="font('size',($event.target as HTMLInputElement).valueAsNumber)" /></label>
          <div class="format-toggles"><label v-for="item in [{key:'bold',label:'加粗'},{key:'italic',label:'斜体'},{key:'underline',label:'下划线'},{key:'strike',label:'删除线'}]" :key="item.key"><input type="checkbox" :aria-label="item.label" :checked="!!values[item.key]" :indeterminate="values[item.key]===undefined" @change="font(item.key,($event.target as HTMLInputElement).checked)" />{{item.label}}</label></div>
          <label>文字颜色<input type="color" aria-label="文字颜色" :value="'#'+(patch.font?.color||values.fontColor?.slice(-6)||'000000')" @input="font('color',($event.target as HTMLInputElement).value.slice(1))" /><button type="button" @click="font('color',null)">自动颜色</button></label>
          <label>填充颜色<input type="color" aria-label="填充颜色" :value="'#'+(patch.fill||values.fillColor?.slice(-6)||'FFFFFF')" @input="patch.fill=($event.target as HTMLInputElement).value.slice(1)" /><button type="button" @click="patch.fill=null">取消填充</button></label>
          <small>字体由本机提供；未安装的字体可能使用替代字体预览。</small>
        </section>
        <section v-else-if="tab==='border'">
          <label>边框范围<select aria-label="边框范围" :value="patch.border?.preset||''" @change="border('preset',($event.target as HTMLSelectElement).value)"><option value="" disabled>保持原边框</option><option v-for="item in [{id:'all',label:'全边框'},{id:'outer',label:'外边框'},{id:'inner',label:'内部边框'},{id:'left',label:'左边框'},{id:'right',label:'右边框'},{id:'top',label:'上边框'},{id:'bottom',label:'下边框'},{id:'none',label:'取消边框'}]" :key="item.id" :value="item.id">{{item.label}}</option></select></label>
          <label>线型<select aria-label="边框线型" :value="patch.border?.style||'thin'" @change="border('style',($event.target as HTMLSelectElement).value)"><option v-for="item in [{id:'thin',label:'细实线'},{id:'medium',label:'中实线'},{id:'thick',label:'粗实线'},{id:'dashed',label:'虚线'},{id:'dotted',label:'点线'},{id:'double',label:'双线'}]" :key="item.id" :value="item.id">{{item.label}}</option></select></label>
          <label>颜色<input type="color" aria-label="边框颜色" :value="'#'+(patch.border?.color||'000000')" @input="border('color',($event.target as HTMLInputElement).value.slice(1))" /></label>
        </section>
        <section v-else-if="tab==='alignment'">
          <label>水平对齐<select aria-label="水平对齐" :value="values.horizontal||''" @change="align('horizontal',($event.target as HTMLSelectElement).value)"><option value="" disabled>保持原值 / 混合</option><option value="left">居左</option><option value="center">居中</option><option value="right">居右</option></select></label>
          <label>垂直对齐<select aria-label="垂直对齐" :value="values.vertical||''" @change="align('vertical',($event.target as HTMLSelectElement).value)"><option value="" disabled>混合</option><option value="top">居上</option><option value="middle">居中</option><option value="bottom">居下</option></select></label>
          <label><input type="checkbox" aria-label="自动换行" :checked="!!values.wrapText" :indeterminate="values.wrapText===undefined" @change="align('wrapText',($event.target as HTMLInputElement).checked)" />自动换行</label>
          <label>缩进<input type="number" aria-label="缩进" min="0" max="15" :value="values.indent" @input="align('indent',($event.target as HTMLInputElement).valueAsNumber)" /></label>
          <label>文字角度<input type="number" aria-label="文字角度" min="-90" max="90" :value="values.rotation" @input="align('textRotation',($event.target as HTMLInputElement).valueAsNumber)" /></label>
        </section>
        <section v-else>
          <label>常用格式<select aria-label="数字格式类别" @change="patch.numFmt=($event.target as HTMLSelectElement).value;values.numFmt=patch.numFmt"><option value="" disabled selected>选择格式</option><option v-for="item in [{code:'General',label:'常规'},{code:'@',label:'文本'},{code:'0',label:'整数'},{code:'0.00',label:'两位小数'},{code:'#,##0.00',label:'千分位'},{code:'0.00%',label:'百分比'},{code:'¥#,##0.00',label:'人民币'},{code:'yyyy-mm-dd',label:'日期'},{code:'hh:mm:ss',label:'时间'}]" :key="item.code" :value="item.code">{{item.label}}</option></select></label>
          <label>格式表达式<input aria-label="数字格式表达式" :value="values.numFmt" placeholder="保持原值 / 混合" @input="patch.numFmt=($event.target as HTMLInputElement).value;values.numFmt=patch.numFmt" /></label><small>数字格式改变显示方式，不修改原始数值。</small>
        </section>
      </fieldset>
      <p class="format-note">未操作的属性保持原值；混合选区仅修改所选属性。</p><p v-if="localError||message" class="excel-edit-error" role="alert">{{localError||message}}</p>
      <footer><button type="button" :disabled="disabled" @click="close">取消</button><button type="submit" :disabled="disabled">{{disabled?'应用中…':'应用到选区'}}</button></footer>
    </form>
  </div></PopupTransition>
</template>
<style scoped>
.excel-format-dialog{display:block;box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto}.excel-format-dialog h3{margin:0 0 14px}.excel-format-dialog nav{display:flex;gap:5px;flex-wrap:wrap}.excel-format-dialog nav [aria-selected=true]{color:var(--accent);border-color:var(--accent)}.excel-format-dialog fieldset{border:0;padding:8px 0;margin:0}.excel-format-dialog label{display:flex;gap:8px;margin:10px 0;justify-content:flex-start}.excel-format-dialog input:not([type=checkbox]):not([type=color]),.excel-format-dialog select{flex:1;min-width:0;width:auto;box-sizing:border-box}.excel-format-dialog input[type=checkbox]{width:auto}.excel-format-dialog input[type=color]{width:48px;height:28px;min-height:0;padding:2px}.format-toggles{display:flex;flex-wrap:wrap;gap:10px}.format-note{font-size:11px;color:var(--muted)}.excel-format-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
</style>
