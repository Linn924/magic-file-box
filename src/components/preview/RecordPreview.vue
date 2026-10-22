<script setup lang="ts">
import {ref,computed,nextTick,watch} from 'vue';
import type {PreviewProps} from '@/modules/types';
import {useSourceRecords} from '@/composables/useSourceRecords';
import SourceAsset from './SourceAsset.vue';
const props=withDefaults(defineProps<PreviewProps&{layout:'text'|'table'|'document';notice:string;search?:boolean}>(),{search:true});
const emit=defineEmits<{ready:[];error:[message:string]}>();
const state=useSourceRecords(props.file,(event,message)=>event==='ready'?emit('ready'):emit('error',message!));
const {info,page,busy,ready,error,query,queryNotice,start,column,sheet,encoding}=state;
const jump=ref((props.file.view?.source?.start??0)+1),scroll=ref<HTMLElement>();
const columns=computed(()=>Array.from({length:Math.min(40,Math.max(1,(page.value?.columns??1)-column.value))},(_,i)=>column.value+i));
function colName(index:number){let text='';for(let n=index+1;n;n=Math.floor((n-1)/26))text=String.fromCharCode(65+(n-1)%26)+text;return text;}
const rendered=computed(()=>{
  let budget=1000;
  function marked(text:string){if(!query.value||!budget)return [{text,hit:false}];const result:Array<{text:string;hit:boolean}>=[];let at=0,next=0;while(budget&&(next=text.indexOf(query.value,at))>=0){result.push({text:text.slice(at,next),hit:false},{text:text.slice(next,next+query.value.length),hit:true});at=next+query.value.length;budget--;}result.push({text:text.slice(at),hit:false});return result;}
  const rows=page.value?.rows??[];
  if(props.layout!=='text')return rows.map(row=>({...row,marked:row.cells.map(marked)}));
  const result:Array<(typeof rows)[number]&{marked:Array<Array<{text:string;hit:boolean}>>}>=[];
  for(let start=0;start<rows.length;){
    let end=start+1;while(end<rows.length&&rows[end].continued&&rows[end].line===rows[start].line)end++;
    const group=rows.slice(start,end),text=group.map(row=>row.cells[0]).join(''),parts=marked(text);
    let offset=0,partStart=0,partIndex=0;
    for(const row of group){
      const length=row.cells[0].length,segments:Array<{text:string;hit:boolean}>=[];
      while(partIndex<parts.length&&partStart<offset+length){
        const part=parts[partIndex],partEnd=partStart+part.text.length;
        if(partEnd>offset)segments.push({text:part.text.slice(Math.max(0,offset-partStart),Math.min(part.text.length,offset+length-partStart)),hit:part.hit});
        if(partEnd>offset+length)break;partStart=partEnd;partIndex++;
      }
      result.push({...row,marked:[segments]});offset+=length;
    }
    start=end;
  }
  return result;
});
watch(page,async()=>{jump.value=start.value+1;await nextTick();scroll.value?.scrollTo(0,0);});
async function load(){await state.load({start:Math.max(0,Math.floor(Number(jump.value)||1)-1)});await nextTick();scroll.value?.scrollTo(0,0);}
</script>
<template>
  <section class="source-preview">
    <p class="notice">{{notice}}</p>
    <div class="source-controls">
      <label v-if="info?.sheets?.length">分组<select v-model="sheet" :disabled="busy" @change="state.changeSheet"><option v-for="item in info.sheets" :key="item.id" :value="item.id">{{item.name}}</option></select></label>
      <label v-if="info?.encoding">编码<select v-model="encoding" :disabled="busy" @change="state.changeEncoding"><option value="utf-8">UTF-8</option><option value="gb18030">GB18030 / GBK</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option></select></label>
      <form v-if="search!==false" role="search" class="source-search" @submit.prevent="state.find"><input v-model="query" aria-label="大文件查找" :maxlength="256" :placeholder="layout==='table'?'查找当前列组':'查找后续正文'"/><button type="submit" :disabled="busy||!query">查找下一处</button></form>
    </div>
    <p v-if="error" class="notice" role="alert">{{error}} <button class="preview-retry" :disabled="busy" @click="state.load()">重新加载</button></p>
    <p v-if="queryNotice" class="notice" role="status">{{queryNotice}}</p>
    <div class="source-stage">
      <div ref="scroll" class="source-scroll" :class="layout==='table'?'table-wrap':layout==='document'?'document-scroll':'text-scroll'" :style="{fontSize:14*zoom/100+'px'}" :aria-busy="busy">
        <table v-if="layout==='table'" class="source-table preview-content"><thead><tr><th>行</th><th v-for="col in columns" :key="col">{{colName(col)}}</th></tr></thead><tbody><tr v-for="row in rendered" :key="row.index" :data-source-row="row.index"><th>{{row.index+1}}</th><td v-for="(parts,index) in row.marked" :key="index"><template v-for="(part,n) in parts" :key="n"><mark v-if="part.hit">{{part.text}}</mark><template v-else>{{part.text}}</template></template></td></tr></tbody></table>
        <div v-else class="source-document preview-content"><div v-for="row in rendered" :key="row.index" class="source-record" :data-source-row="row.index" :class="{'source-heading':row.level}" :style="row.level?{fontSize:(1.8-Math.min(row.level,6)*.12)+'em',fontWeight:600}:undefined"><small v-if="layout==='text'" class="source-line">{{row.continued?'↳':row.line??row.index+1}}</small><span class="source-record-text"><template v-for="(part,n) in row.marked[0]" :key="n"><mark v-if="part.hit">{{part.text}}</mark><template v-else>{{part.text}}</template></template></span><small v-if="row.assetWarning" class="source-asset-warning" role="status">{{row.assetWarning}}</small><SourceAsset v-for="url in row.assets" :key="url" :url="url" :file-id="file.id" /></div></div>
      </div>
      <div v-if="busy && ready" class="loading source-loading" role="status"><span class="loading-spinner" aria-hidden="true"></span><span>正在读取内容…</span><button class="preview-cancel-load" @click="state.cancel">取消读取</button></div>
    </div>
    <footer class="source-controls source-footer">
      <button :disabled="busy||start===0" @click="state.previous">上一段</button><button :disabled="busy||!page?.more" @click="state.next">下一段</button>
      <form @submit.prevent="load"><label>起始位置<input v-model.number="jump" aria-label="大文件起始位置" type="number" min="1" :disabled="busy"/></label><button type="submit" :disabled="busy">定位</button></form>
      <template v-if="layout==='table'"><button :disabled="busy||column===0" @click="state.changeColumn(-40)">前 40 列</button><button :disabled="busy||column+40>=(page?.columns??0)" @click="state.changeColumn(40)">后 40 列</button></template>
      <small>{{page?.total===undefined?'已扫描 '+(page?.scanned??0)+' 项':'共 '+page.total+' 项'}} · 当前从 {{start+1}} 开始</small>
    </footer>
  </section>
</template>
<style scoped>
.source-preview{display:flex;flex:1;min-height:0;min-width:0;flex-direction:column;overflow:hidden;background:var(--panel);color:var(--text)}
.source-stage{position:relative;display:flex;flex:1;min-height:0;min-width:0}
.source-asset-warning{display:block;color:var(--muted);font-size:12px;margin:8px 0}
.source-controls{display:flex;align-items:center;gap:8px;padding:6px 10px;flex-wrap:wrap;background:var(--panel);border-bottom:1px solid var(--line);flex-shrink:0;font-size:12px}
.source-controls label,.source-controls form{display:flex;align-items:center;gap:6px;min-width:0}.source-controls select{max-width:240px}.source-controls input,.source-controls select{min-height:28px;background:var(--well);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:3px 6px}.source-controls input{width:140px}.source-controls .source-search input{width:180px}
.source-controls button,.source-preview .notice button{display:inline-flex;align-items:center;justify-content:center;text-align:center;line-height:1.4;min-height:28px;padding:4px 10px}
.source-scroll{position:relative;overflow:auto;flex:1;min-height:0;background:var(--panel);padding:0}.source-document{padding:12px 16px;line-height:1.65}.source-record{white-space:pre-wrap;overflow-wrap:anywhere;min-height:1.65em}.source-record-text{white-space:pre-wrap}.source-line{display:inline-block;width:5em;max-width:25%;padding-right:12px;color:var(--muted);user-select:none}.source-heading{margin:12px 0}.source-table{border-collapse:separate;border-spacing:0;min-width:100%;font:inherit}.source-table th,.source-table td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 8px;white-space:pre-wrap;min-width:100px;max-width:500px;overflow-wrap:anywhere}.source-table th{background:var(--well);font-weight:400}.source-table thead{position:sticky;top:0;z-index:2}.source-table th:first-child{min-width:52px}.source-footer{border-top:1px solid var(--line);border-bottom:0}.source-footer input{width:90px}.source-footer small{color:var(--muted)}.source-loading{z-index:10}mark{background:#fde68a;color:#20262e;border-radius:2px}
</style>
