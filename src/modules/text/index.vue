<script setup lang="ts">
import { computed, ref, shallowRef, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { PreviewProps } from "@/modules/types";
import { usePreview } from "./composables/usePreview";
import { createSafeResizeObserver } from "@/utils/safeResizeObserver";
import textModule from "./";
import {renderTextLine,renderSyntaxLine} from './core/highlight';
import {indexSourceMatchesAsync,sourceMatchAtAsync,type SourceSearchIndex} from './core/sourceSearch';
import {codeFolds} from './core/folding';
import {useSyntax} from './composables/useSyntax';
import {languageNames} from './core/languages';
import {useCodeAppearance} from './composables/useCodeAppearance';
import {LineHeights} from './core/lineHeights';
import ToolButton from '@/components/ui/ToolButton.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import MarkdownView from './components/MarkdownView.vue';
import MarkdownOutline from './components/MarkdownOutline.vue';
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const { pane, encoding, raw, pretty, invalidJson } = usePreview(
  props,
  emit,
);
const linkError=ref('');
const mdReader=ref<InstanceType<typeof MarkdownView>>();
const sourceMode=ref(props.file.view?.markdown?.source??false),showOutline=ref(props.file.view?.markdown?.outline??false);
const headings=ref<Array<{anchor:string;text:string;level:number}>>([]),renderedHits=ref({count:0,index:-1}),activeHeading=ref('');
watch([sourceMode,showOutline],()=>{props.file.view??={zoom:props.zoom,scroll:[]};props.file.view.markdown={source:sourceMode.value,outline:showOutline.value};},{flush:'sync'});
let sourceTop=0,readingTop=0;
async function toggleSource(){if(textScroll.value){if(sourceMode.value)sourceTop=textScroll.value.scrollTop;else readingTop=textScroll.value.scrollTop;}sourceMode.value=!sourceMode.value;await nextTick();if(textScroll.value)textScroll.value.scrollTop=sourceMode.value?sourceTop:readingTop;}
function jumpHeading(anchor:string){linkError.value='';mdReader.value?.jumpAnchor(anchor,true);}
const query = ref("");
const showLines = ref(true);
const showSearch = ref(false);
const searchInput = ref<HTMLInputElement>();
const showGo=ref(false),goInput=ref<HTMLInputElement>(),goLine=ref('1'),goError=ref(''),jumpedLine=ref(-1);
watch(showGo,async value=>{if(value){goError.value='';await nextTick();goInput.value?.focus();goInput.value?.select();}});
watch(showSearch, async value => { if (value) { await nextTick(); searchInput.value?.focus({preventScroll:true}); } else query.value=''; });
function findKey(event:KeyboardEvent){if((event.ctrlKey||event.metaKey)&&pane.value?.clientWidth){if(event.key.toLowerCase()==='f'){event.preventDefault();showSearch.value=true;void nextTick(()=>searchInput.value?.focus({preventScroll:true}));}else if(event.key.toLowerCase()==='g'&&!showHtml.value){event.preventDefault();showGo.value=true;}}}
const lines = computed(() => (pretty.value || "").split("\n"));
const showHtml = computed(() => props.file.ext === 'md' && !sourceMode.value);
const syntaxText=computed(()=>props.file.ext==='md'&&!sourceMode.value?'':pretty.value);
function sourcePosition(force=false){const root=textScroll.value;if(!root?.clientHeight)return ()=>{};const top=root.getBoundingClientRect().top,node=Array.from(root.querySelectorAll<HTMLElement>('.text-line')).find(n=>n.getBoundingClientRect().bottom>top),before=root.scrollTop,offset=node?node.getBoundingClientRect().top-top:0;return ()=>{if((force||root.scrollTop===before)&&node?.isConnected)root.scrollTop+=node.getBoundingClientRect().top-root.getBoundingClientRect().top-offset;};}
const syntax=useSyntax(props.file.id,syntaxText,props.file.ext,sourcePosition);
const folds=computed(()=>codeFolds(lines.value,syntax.data.value,syntax.lang));
const folded=ref(new Set(props.file.view?.text?.folded??[]));
const foldByLine=computed(()=>new Map(folds.value.map(range=>[range.start,range])));
const visibleLineNumbers=computed(()=>{
  const result:number[]=[];let through=-1;
  for(let i=0;i<lines.value.length;i++){if(i<=through)continue;result.push(i);const range=foldByLine.value.get(i);if(range&&folded.value.has(i))through=range.end;}
  return result;
});
const visiblePositions=computed(()=>folds.value.some(range=>folded.value.has(range.start))?new Map(visibleLineNumbers.value.map((line,i)=>[line,i])):undefined);
function linePosition(line:number){return visiblePositions.value?visiblePositions.value.get(line):line>=0&&line<lines.value.length?line:undefined;}
watch(folded,value=>{props.file.view??={zoom:props.zoom,scroll:[]};props.file.view.text={folded:[...value]};},{flush:'sync'});
function toggleFold(line:number){const next=new Set(folded.value);if(next.has(line))next.delete(line);else next.add(line);folded.value=next;}
function openLine(line:number){const next=new Set(folded.value);for(const range of folds.value)if(range.start<line&&range.end>=line)next.delete(range.start);if(next.size!==folded.value.size)folded.value=next;}
watch(encoding,()=>{folded.value=new Set();jumpedLine.value=-1;});
useCodeAppearance(()=>{if(showHtml.value)return mdReader.value?.captureReading()??(()=>{});const restore=sourcePosition(true);return ()=>{updateVirtual();void nextTick(restore);};});

/** 超过此行数才启用虚拟滚动，小文件直接全量渲染 */
const VIRTUAL_THRESHOLD = 3000;
/** 视口外额外保留的行数（上下各一份） */
const OVERSCAN = 5;

const useVirtual = computed(() => visibleLineNumbers.value.length > VIRTUAL_THRESHOLD);

// ------- 虚拟滚动状态 -------
const textScroll = ref<HTMLElement>();
const vStart = ref(0);
const vEnd = ref(VIRTUAL_THRESHOLD); // 初始先渲染前 N 行
const padTop = ref(0);
const padBottom = ref(0);

const estimatedHeight=()=>Math.floor((14*props.zoom/100)*1.65*64)/64;
let heights=new LineHeights(visibleLineNumbers.value.length,estimatedHeight());
let virtualRevision=0,virtualDisposed=false;
function contentPadding(root:HTMLElement){return parseFloat(getComputedStyle(root).paddingTop||'0')+parseFloat(getComputedStyle(root.querySelector('.text-code')||root).paddingTop||'0');}
function windowAt(top:number){
  const root=textScroll.value;if(!root)return;
  const y=Math.max(0,top-contentPadding(root)),total=visibleLineNumbers.value.length;
  const start=Math.max(0,heights.at(y)-OVERSCAN),end=Math.min(total,heights.at(y+root.clientHeight)+1+OVERSCAN);
  vStart.value=start;vEnd.value=Math.max(start+1,end);
  padTop.value=heights.prefix(start);padBottom.value=Math.max(0,heights.prefix(total)-heights.prefix(vEnd.value));
}
function updateVirtual(){
  if(!useVirtual.value)return;
  const root=textScroll.value;if(!root?.clientWidth||!root.clientHeight)return;
  const revision=++virtualRevision,model=heights,before=root.scrollTop;
  const boundary=root.getBoundingClientRect();
  const visible=Array.from(root.querySelectorAll<HTMLElement>('.text-line')).find(line=>{const r=line.getBoundingClientRect();return r.bottom>boundary.top&&r.top<boundary.bottom;});
  const anchor=visible?(linePosition(Number(visible.dataset.line)-1)??0):model.at(Math.max(0,before-contentPadding(root))),offset=model.prefix(anchor);
  let changed=false;
  for(const line of root.querySelectorAll<HTMLElement>('.text-line'))changed=model.set(linePosition(Number(line.dataset.line)-1)??-1,line.getBoundingClientRect().height)||changed;
  const target=before+model.prefix(anchor)-offset;windowAt(target);
  if(changed)void nextTick().then(()=>{if(!virtualDisposed&&revision===virtualRevision&&heights===model)root.scrollTop=target;});
}
watch([vStart,vEnd],()=>{void nextTick().then(updateVirtual);},{flush:'post'});
watch(useVirtual,async on=>{
  if(!on){vStart.value=0;vEnd.value=0;padTop.value=0;padBottom.value=0;}
  else {heights=new LineHeights(visibleLineNumbers.value.length,estimatedHeight());await nextTick();updateVirtual();}
});
watch(visibleLineNumbers,async numbers=>{
  const root=textScroll.value,edge=root?.getBoundingClientRect().top??0,node=root&&[...root.querySelectorAll<HTMLElement>('.text-line')].find(el=>el.getBoundingClientRect().bottom>edge);
  const rawLine=node?Number(node.dataset.line)-1:0,next=numbers.findIndex(line=>line>rawLine),position=next<0?numbers.length-1:Math.max(0,next-1),revision=++virtualRevision;
  heights=new LineHeights(numbers.length,estimatedHeight());
  const target=contentPadding(root??document.documentElement)+heights.prefix(position);
  if(useVirtual.value)windowAt(target);
  await nextTick();if(revision!==virtualRevision||virtualDisposed)return;
  if(root){if(useVirtual.value)root.scrollTop=target;else if(node){const replacement=root.querySelector<HTMLElement>(`.text-line[data-line="${numbers[position]+1}"]`);if(replacement)root.scrollTop+=replacement.getBoundingClientRect().top-edge;}}
  updateVirtual();
});
watch(()=>props.zoom,async(value,old)=>{
  if(!useVirtual.value)return;
  const root=textScroll.value;if(!root)return;
  const padding=contentPadding(root),anchor=heights.at(Math.max(0,root.scrollTop-padding)),offset=root.scrollTop-padding-heights.prefix(anchor);
  heights=heights.scaled(value/old,estimatedHeight());
  const target=padding+heights.prefix(anchor)+offset*value/old;windowAt(target);
  await nextTick();if(!virtualDisposed){root.scrollTop=target;updateVirtual();}
});
watch([showLines,query],()=>{void nextTick().then(updateVirtual);});
let resizeObs:ResizeObserver|undefined;
onMounted(()=>{window.addEventListener('keydown',findKey);updateVirtual();resizeObs=createSafeResizeObserver(updateVirtual);if(textScroll.value)resizeObs.observe(textScroll.value);});
onBeforeUnmount(()=>{window.removeEventListener('keydown',findKey);virtualDisposed=true;virtualRevision++;searchRevision++;resizeObs?.disconnect();});

/** 当前视口内实际渲染的行（小文件为全部，大文件为虚拟窗口） */
const virtualLines = computed(() => {
  const numbers=useVirtual.value?visibleLineNumbers.value.slice(vStart.value,vEnd.value):visibleLineNumbers.value;
  return numbers.map(line=>({text:lines.value[line],line}));
});

const sourceHits = shallowRef<SourceSearchIndex>({count:0,lines:[]}),searchedQuery=ref(''),delayedQuery=ref(''),searching=ref(false);
const partialHighlights=computed(()=>sourceHits.value.lines.some(line=>line.count>512));
const selectedHit = ref(-1);
const currentHit = shallowRef<{line:number;start:number;end:number}>();
const matchCount = computed(() => showHtml.value ? renderedHits.value.count : sourceHits.value.count);
const matchIndex = computed(() => showHtml.value ? renderedHits.value.index : selectedHit.value);
let searchRevision = 0;
let navigationIntent=0,hitIntent=0;
watch([lines,query,showHtml],async(_value,_previous,cleanup)=>{
  const controller=new AbortController(),value=query.value,documentLines=lines.value,intent=++navigationIntent;
  let timer:ReturnType<typeof setTimeout>|undefined;
  cleanup(()=>{controller.abort();clearTimeout(timer);});
  sourceHits.value={count:0,lines:[]};currentHit.value=undefined;selectedHit.value=-1;searchedQuery.value='';renderedHits.value={count:0,index:-1};searchRevision++;
  searching.value=!!value.trim();
  await new Promise<void>(resolve=>{timer=setTimeout(resolve,120);controller.signal.addEventListener('abort',()=>resolve(),{once:true});});
  if(controller.signal.aborted)return;delayedQuery.value=value;
  try{if(!showHtml.value){const index=await indexSourceMatchesAsync(documentLines,value,controller.signal);if(controller.signal.aborted)return;searchedQuery.value=value;sourceHits.value=index;hitIntent=intent;selectedHit.value=index.count?0:-1;}}
  catch(error){if(!controller.signal.aborted)linkError.value='搜索未完成，请缩短查询后重试。';}
  finally{if(!controller.signal.aborted)searching.value=false;}
},{immediate:true,flush:'sync'});
watch([sourceHits,selectedHit],async(_value,_previous,cleanup)=>{
  const controller=new AbortController(),intent=hitIntent;cleanup(()=>controller.abort());
  try{const hit=await sourceMatchAtAsync(sourceHits.value,lines.value,searchedQuery.value,selectedHit.value,controller.signal);if(controller.signal.aborted)return;currentHit.value=hit;if(intent===navigationIntent)void revealSourceHit();}catch{/* superseded selection */}
});

async function mountLine(line:number){
  openLine(line);await nextTick();await nextTick();virtualRevision++;
  const root=textScroll.value;if(!root)return;
  if(useVirtual.value){const position=linePosition(line);if(position===undefined)return;const target=contentPadding(root)+heights.prefix(position);windowAt(target);root.scrollTop=target;await nextTick();updateVirtual();await nextTick();}
  return root.querySelector<HTMLElement>(`.text-line[data-line="${line+1}"]`);
}
async function goToLine(){
  const value=Number(goLine.value);if(!Number.isInteger(value)||value<1||value>lines.value.length){goError.value=`请输入 1–${lines.value.length} 的行号`;return;}
  navigationIntent++;searchRevision++;const node=await mountLine(value-1),root=textScroll.value;
  if(node&&root){jumpedLine.value=value-1;root.scrollTop+=node.getBoundingClientRect().top-root.getBoundingClientRect().top-12;updateVirtual();showGo.value=false;root.focus({preventScroll:true});}
}

async function revealSourceHit() {
  const revision = ++searchRevision, hit = currentHit.value, root = textScroll.value;
  // Cancel any queued virtual anchor correction from before this navigation.
  virtualRevision++;
  await nextTick();
  const valid = () => revision === searchRevision && !virtualDisposed && !showHtml.value && !!root?.clientHeight && !!root.clientWidth;
  if (!hit || !root || !valid()) return;
  await mountLine(hit.line);if(!valid())return;
  const selector = `.text-line[data-line="${hit.line + 1}"] .text-current-hit`;
  if (useVirtual.value && !root.querySelector(selector)) {
    const target = contentPadding(root) + heights.prefix(linePosition(hit.line)??0);
    windowAt(target);
    root.scrollTop = target;
    await nextTick();
    if (!valid()) return;
    updateVirtual();
    await nextTick();
  }
  if (!valid()) return;
  const mark = root.querySelector<HTMLElement>(selector);
  const rect = mark?.getClientRects()[0];
  if (!rect) return;
  root.scrollTop += rect.top - root.getBoundingClientRect().top - Math.max(8, (root.clientHeight - rect.height) / 2);
  if (useVirtual.value) windowAt(root.scrollTop);
  await nextTick();
  if (valid()) updateVirtual();
}

function findNext(direction: number) {
  if (showHtml.value) { mdReader.value?.findNext(direction); return; }
  if (!sourceHits.value.count) return;
  hitIntent=++navigationIntent;selectedHit.value = (selectedHit.value + direction + sourceHits.value.count) % sourceHits.value.count;
}
function searchKey(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  findNext(event.shiftKey ? -1 : 1);
}
function markSearch(line:string,index:number) {
  const data=syntax.data.value, current=currentHit.value;
  const start=current?.line===index?current.start:-1;
  return data?renderSyntaxLine(line,data.lines[index],data.styles,searchedQuery.value,start):renderTextLine(line,'',searchedQuery.value,start);
}
watch(syntax.data,()=>void nextTick().then(updateVirtual));
</script>
<template>
  <section ref="pane" class="text" data-code-appearance>
    <Teleport :to="`[data-file-id='${props.file.id}'] .module-tools`" defer>
      <span class="text-tools filebar-inline" data-text-tools>
        <span v-if="file.ext==='md'" class="preview-tool-group" data-text-group="reading"><ToolButton class="md-outline-toggle" icon="navigation" title="显示 / 隐藏标题目录" :pressed="showOutline" :disabled="sourceMode" @click="showOutline=!showOutline" /><ToolButton class="md-source-toggle" :icon="sourceMode?'preview':'code'" :title="sourceMode?'查看 Markdown 排版':'查看 Markdown 源码'" :pressed="sourceMode" @click="toggleSource" /></span>
        <span class="preview-tool-group" data-text-group="query"><ToolButton class="text-search-toggle" icon="search" :pressed="showSearch" :aria-expanded="showSearch" aria-haspopup="dialog" :title="showSearch?'收起查找窗口':'查找文本内容（Ctrl+F）'" @click="showSearch=!showSearch" /><ToolButton class="text-lines-toggle" icon="lines" :pressed="!showHtml&&showLines" :disabled="showHtml" :title="showHtml?'Markdown 排版预览不显示行号':'显示 / 隐藏行号'" @click="showLines=!showLines" /></span>
        <span v-if="!showHtml" class="preview-tool-group" data-text-group="navigation"><ToolButton class="text-go-toggle" icon="jump" title="跳转到行（Ctrl+G）" :pressed="showGo" @click="showGo=!showGo"/><template v-if="folds.length"><ToolButton class="text-fold-all" icon="minus" title="折叠所有代码块" @click="folded=new Set(folds.map(range=>range.start))"/><ToolButton class="text-unfold-all" icon="plus" title="展开所有代码块" :disabled="!folded.size" @click="folded=new Set()"/></template></span>
        <label class="tool-field" title="文本编码"
          >
          <select v-model="encoding" aria-label="文本编码" title="文本编码">
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GBK</option>
            <option value="utf-16le">UTF-16 LE</option>
            <option value="utf-16be">UTF-16 BE</option>
          </select></label
        >
      </span>
    </Teleport>
    <PreviewPanel v-model:open="showGo" title="跳转到行" :target="`[data-file-id='${props.file.id}'] .floating-tools`" trigger=".text-go-toggle" close-label="关闭行号跳转"><form class="text-go-form" novalidate @submit.prevent="goToLine"><label>行号（1–{{lines.length}}）<input ref="goInput" v-model="goLine" type="number" min="1" :max="lines.length" aria-label="跳转行号"/></label><button type="submit">跳转</button><p v-if="goError" role="alert">{{goError}}</p></form></PreviewPanel>
    <PreviewPanel v-model:open="showSearch" title="查找文本内容" :target="`[data-file-id='${props.file.id}'] .floating-tools`" trigger=".text-search-toggle" close-label="关闭文本搜索">
      <div class="text-search-bar" role="search">
        <div class="query-primary">
        <input
          ref="searchInput"
          v-model="query"
          class="text-search-input"
          aria-label="搜索文本"
          placeholder="搜索"
          @keydown.enter="searchKey"
        />
        <ToolButton icon="clear" title="清除搜索" :disabled="!query" @click="query=''" /></div>
        <div class="query-results"><span class="text-search-count" aria-live="polite">{{searching?'搜索中…':query.trim()?(matchCount?(matchIndex+1)+' / '+matchCount+' 处匹配':'0 处匹配'):'输入内容开始查找'}}</span><ToolButton class="text-find-previous" :class="{'md-find-previous':showHtml}" icon="up" title="上一处匹配（Shift+Enter）" :disabled="!matchCount" @click="findNext(-1)"/><ToolButton class="text-find-next" :class="{'md-find-next':showHtml}" icon="down" title="下一处匹配（Enter）" :disabled="!matchCount" @click="findNext(1)"/></div>
      </div>
    </PreviewPanel>
    <div v-if="invalidJson" class="notice">
      JSON 格式不完整，按原始文本显示。
    </div>
    <p v-if="!showHtml&&partialHighlights" class="notice">重复匹配较多的行仅显示部分高亮；匹配计数和上一处、下一处定位仍包含全部结果。</p>
    <p v-if="linkError" class="notice" role="alert">{{linkError}}</p>
    <div class="text-body">
    <MarkdownOutline v-if="showHtml&&showOutline" :headings="headings" :active="activeHeading" @jump="jumpHeading" />
    <div
      ref="textScroll"
      class="text-scroll"
      tabindex="0"
      @scroll.passive="updateVirtual"
    >
      <MarkdownView v-if="showHtml" ref="mdReader" :file="file" :raw="raw" :query="delayedQuery" :zoom="zoom" @headings="headings=$event" @active="activeHeading=$event" @hits="renderedHits=$event" @error="linkError=$event" />
      <div
        v-else
        class="text-code preview-content"
        :class="{ 'with-lines': showLines }"
        :style="{ fontSize: (14 * zoom) / 100 + 'px' }"
      >
        <!-- 虚拟滚动上方占位 -->
        <div
          v-if="useVirtual && padTop > 0"
          class="text-virtual-pad"
          :style="{ height: padTop + 'px' }"
          aria-hidden="true"
        ></div>
        <div
          v-for="(line, i) in virtualLines"
          :key="line.line"
          class="text-line"
          :class="{'text-jump-target':jumpedLine===line.line}"
          :data-line="line.line + 1"
        >
          <span v-if="folds.length" class="text-fold-gutter"><button v-if="foldByLine.has(line.line)" type="button" class="text-fold-toggle" :aria-expanded="!folded.has(line.line)" :aria-label="(folded.has(line.line)?'展开':'折叠')+'第 '+(line.line+1)+' 行代码块'" @click="toggleFold(line.line)">{{folded.has(line.line)?'▸':'▾'}}</button></span>
          <span v-if="showLines" class="line-no" aria-hidden="true">{{
            line.line + 1
          }}</span>
          <code class="line-body" v-html="markSearch(line.text,line.line)"></code><button v-if="folded.has(line.line)&&foldByLine.has(line.line)" class="text-fold-summary" :title="'展开 '+(foldByLine.get(line.line)!.end-line.line)+' 行'" @click="toggleFold(line.line)">… {{foldByLine.get(line.line)!.end-line.line}} 行</button>
        </div>
        <!-- 虚拟滚动下方占位 -->
        <div
          v-if="useVirtual && padBottom > 0"
          class="text-virtual-pad"
          :style="{ height: padBottom + 'px' }"
          aria-hidden="true"
        ></div>
      </div>
    </div>
    </div>
    <footer class="pane-footer text-footer"><span>{{raw.length.toLocaleString()}} 字 · {{lines.length.toLocaleString()}} 行</span><span v-if="syntax.lang" :title="syntax.status.value" class="syntax-status">{{languageNames[syntax.lang]}}<span v-if="syntax.status.value"> · {{syntax.status.value}}</span></span></footer>
  </section>
</template>
