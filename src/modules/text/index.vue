<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import type { PreviewProps } from "../types";
import { usePreview } from "./usePreview";
import { createSafeResizeObserver } from "../../composables/safeResizeObserver";
import textModule from "./index";
import {renderTextLine,textMatches} from './highlight';
import {LineHeights} from './lineHeights';
import ToolButton from '../../components/ToolButton.vue';
import PreviewPanel from '../../components/PreviewPanel.vue';
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const { pane, encoding, raw, pretty, invalidJson, html } = usePreview(
  props,
  emit,
);
const linkError=ref('');
function jumpAnchor(fragment:string,decoded=false){const article=pane.value?.querySelector<HTMLElement>('.markdown');if(!article)return false;let anchor:string;try{anchor=decoded?fragment:decodeURIComponent(fragment.replace(/^#/,''));}catch{linkError.value='链接位置编码无效。';return false;}if(!anchor){textScroll.value?.scrollTo({top:0});return true;}const target=Array.from(article.querySelectorAll<HTMLElement>('[data-md-anchor],[id]')).find(n=>n.dataset.mdAnchor===anchor||n.dataset.mdOriginal===anchor||n.id===anchor);if(!target){linkError.value='找不到文档中的链接位置。';return false;}target.scrollIntoView({block:'start'});return true;}
async function followLink(event:MouseEvent){const link=(event.target as Element)?.closest<HTMLAnchorElement>('a');if(!link)return;event.preventDefault();const href=link.getAttribute('data-md-href')??link.getAttribute('href');if(!href)return;linkError.value='';if(href.startsWith('#')){jumpAnchor(href);return;}try{await window.localPreview.followMarkdownLink(props.file.id,href);}catch(e){linkError.value=String(e).replace(/^Error:.*?Error: /,'');}}
onMounted(()=>{const anchor=props.file.view?.markdownAnchor;if(props.file.ext==='md'&&anchor){delete props.file.view!.markdownAnchor;requestAnimationFrame(()=>requestAnimationFrame(()=>jumpAnchor(anchor,true)));}});
const query = ref("");
const showLines = ref(true);
const showSearch = ref(false);
const searchInput = ref<HTMLInputElement>();
watch(showSearch, async value => { if (value) { await nextTick(); searchInput.value?.focus({preventScroll:true}); } else query.value=''; });
function findKey(event:KeyboardEvent){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&pane.value?.clientWidth){event.preventDefault();showSearch.value=true;void nextTick(()=>searchInput.value?.focus({preventScroll:true}));}}
const lines = computed(() => (pretty.value || "").split("\n"));

/** 超过此行数才启用虚拟滚动，小文件直接全量渲染 */
const VIRTUAL_THRESHOLD = 3000;
/** 视口外额外保留的行数（上下各一份） */
const OVERSCAN = 5;

const useVirtual = computed(() => lines.value.length > VIRTUAL_THRESHOLD);

// ------- 虚拟滚动状态 -------
const textScroll = ref<HTMLElement>();
const vStart = ref(0);
const vEnd = ref(VIRTUAL_THRESHOLD); // 初始先渲染前 N 行
const padTop = ref(0);
const padBottom = ref(0);

const estimatedHeight=()=>Math.floor((14*props.zoom/100)*1.65*64)/64;
let heights=new LineHeights(lines.value.length,estimatedHeight());
let virtualRevision=0,virtualDisposed=false;
function contentPadding(root:HTMLElement){return parseFloat(getComputedStyle(root).paddingTop||'0')+parseFloat(getComputedStyle(root.querySelector('.text-code')||root).paddingTop||'0');}
function windowAt(top:number){
  const root=textScroll.value;if(!root)return;
  const y=Math.max(0,top-contentPadding(root)),total=lines.value.length;
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
  const anchor=visible?Number(visible.dataset.line)-1:model.at(Math.max(0,before-contentPadding(root))),offset=model.prefix(anchor);
  let changed=false;
  for(const line of root.querySelectorAll<HTMLElement>('.text-line'))changed=model.set(Number(line.dataset.line)-1,line.getBoundingClientRect().height)||changed;
  const target=before+model.prefix(anchor)-offset;windowAt(target);
  if(changed)void nextTick().then(()=>{if(!virtualDisposed&&revision===virtualRevision&&heights===model)root.scrollTop=target;});
}
watch([vStart,vEnd],()=>{void nextTick().then(updateVirtual);},{flush:'post'});
watch(useVirtual,async on=>{
  if(!on){vStart.value=0;vEnd.value=0;padTop.value=0;padBottom.value=0;}
  else {heights=new LineHeights(lines.value.length,estimatedHeight());await nextTick();updateVirtual();}
});
watch(lines,async()=>{
  heights=new LineHeights(lines.value.length,estimatedHeight());
  if(!useVirtual.value)return;
  if(textScroll.value)textScroll.value.scrollTop=0;vStart.value=0;
  await nextTick();updateVirtual();
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
onBeforeUnmount(()=>{window.removeEventListener('keydown',findKey);virtualDisposed=true;virtualRevision++;resizeObs?.disconnect();});

/** 当前视口内实际渲染的行（小文件为全部，大文件为虚拟窗口） */
const virtualLines = computed(() => {
  if (!useVirtual.value) return lines.value;
  return lines.value.slice(vStart.value, vEnd.value);
});

const hitCount = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return 0;
  // 始终基于全量 lines 统计，不受虚拟化影响
  return lines.value.reduce(
    (n, line) => n + (textMatches(line,query.value).length ? 1 : 0),
    0,
  );
});
const isCode = computed(() => textModule.extensions.includes(props.file.ext));
function markSearch(line:string) {return renderTextLine(line,isCode.value?props.file.ext:'',query.value);}
const showHtml = computed(
  () => props.file.ext === "md" && !showSearch.value,
);
</script>
<template>
  <section ref="pane" class="text">
    <Teleport :to="`[data-file-id='${props.file.id}'] .module-tools`" defer>
      <span class="text-tools filebar-inline" data-text-tools>
        <span class="preview-tool-group" data-text-group="query"><ToolButton class="text-search-toggle" icon="search" :pressed="showSearch" :aria-expanded="showSearch" aria-haspopup="dialog" :title="showSearch?'收起查找窗口':'查找文本内容（Ctrl+F）'" @click="showSearch=!showSearch" /><ToolButton class="text-lines-toggle" icon="lines" :pressed="!showHtml&&showLines" :disabled="showHtml" :title="showHtml?'Markdown 排版预览不显示行号':'显示 / 隐藏行号'" @click="showLines=!showLines" /></span>
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
    <PreviewPanel v-model:open="showSearch" title="查找文本内容" :target="`[data-file-id='${props.file.id}'] .floating-tools`" trigger=".text-search-toggle" close-label="关闭文本搜索">
      <div class="text-search-bar" role="search">
        <div class="query-primary">
        <input
          ref="searchInput"
          v-model="query"
          class="text-search-input"
          aria-label="搜索文本"
          placeholder="搜索"
        />
        <ToolButton icon="clear" title="清除搜索" :disabled="!query" @click="query=''" /></div>
        <div class="query-results"><span class="text-search-count" aria-live="polite">{{query.trim()?hitCount+' 行匹配':'输入内容开始查找'}}</span></div>
      </div>
    </PreviewPanel>
    <div v-if="invalidJson" class="notice">
      JSON 格式不完整，按原始文本显示。
    </div>
    <p v-if="linkError" class="notice" role="alert">{{linkError}}</p>
    <div
      ref="textScroll"
      class="text-scroll"
      @scroll.passive="updateVirtual"
    >
      <article
        v-if="showHtml"
        class="markdown preview-content"
        :style="{ fontSize: (15 * zoom) / 100 + 'px' }"
        @click="followLink"
        v-html="html"
      ></article>
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
          :key="vStart + i"
          class="text-line"
          :data-line="vStart + i + 1"
        >
          <span v-if="showLines" class="line-no" aria-hidden="true">{{
            vStart + i + 1
          }}</span>
          <code class="line-body" v-html="markSearch(line)"></code>
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
    <footer class="pane-footer text-footer"><span>{{raw.length.toLocaleString()}} 字 · {{lines.length.toLocaleString()}} 行</span></footer>
  </section>
</template>
