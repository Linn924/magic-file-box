<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, inject, ref, watch } from "vue";
import type { PreviewProps } from "@/modules/types";
import { usePreview } from "./composables/usePreview";
import { usePdfSearch, type SearchHit } from "./composables/useSearch";
import PageNavigation from "@/components/preview/PageNavigation.vue";
import PdfSearch from "./components/PdfSearch.vue";
import ToolButton from '@/components/ui/ToolButton.vue';
import PdfNav from "./components/PdfNav.vue";
import {usePan} from './composables/usePan';
import {useAnnotations} from './composables/useAnnotations';
import {exportAnnotatedPage} from './core/exportNotes';
import PdfNotes from './components/PdfNotes.vue';
import { pageTextContent, mappedPdfText } from './core/textCache';
import { Util } from 'pdfjs-dist';
const props = defineProps<PreviewProps>();
const presentation=ref(false);
let priorFullscreen=false;
let fullscreenCleanup:(()=>void)|undefined;
let readingRestore:ReturnType<typeof setTimeout>|undefined;
let readingInteraction=0;
function cancelReadingRestore(){readingInteraction++;clearTimeout(readingRestore);}
function selectReadingPage(index:number){cancelReadingRestore();focusPage(index);}
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const {
  scroll,
  pages,
  current,
  sync,
  jump,
  dimensions,
  visiblePages,visibleRows,pageLayout,rowDimensions,focusPage,releasePageFocus,
  padTop,
  padBottom,
  pdf,
  needPassword,
  passwordError,
  unlock,
  rotate,
  layout,
  textGeometry,
  setRotate,
  allowPrint,
} = usePreview(props, emit,(allowed,password)=>publishPrintPermission?.(allowed,password),presentation);
const search = usePdfSearch(pdf);
const publishPrintPermission=inject<(allowed:boolean,password?:string)=>void>('pdf:set-print-permission');
watch(allowPrint,value=>publishPrintPermission?.(value),{immediate:true});
const searchOpen = ref(false);
watch(searchOpen, open => { if (!open) search.clear(); });
const navOpen = ref(false);
const passwordInput = ref("");
const {panning}=usePan(scroll,computed(()=>!presentation.value));
const annotations=useAnnotations(props.file);
const notesOpen=ref(false);
const exporting=ref(false),exportStatus=ref('');
const exportController=new AbortController();
async function exportNotes(){
  const doc=pdf.value;if(!doc||exporting.value)return;
  exporting.value=true;exportStatus.value='';
  const page=current.value;
  const notes=annotations.onPage(page).map(note=>({...note,rects:note.rects.map(rect=>({...rect}))}));
  try {
    const data=await exportAnnotatedPage(doc,page,rotate.value,notes,exportController.signal);
    if(exportController.signal.aborted)return;
    const result=await window.localPreview.exportPdfNotes(props.file.id,props.file.name.replace(/\.pdf$/i,'')+'-第'+page+'页-批注.png',data);
    exportStatus.value=result==='saved'?'已保存当前页批注图片。':'已取消保存。';
  } catch(error){if(!exportController.signal.aborted)exportStatus.value=error instanceof Error?error.message:String(error);}
  finally {exporting.value=false;}
}
const paneRoot=ref<HTMLElement>(),markPosition=ref({left:8,top:8});
function captureNotes(){if(panning.value)return;annotations.capture(scroll.value??null,rotate.value);if(annotations.pending.value&&paneRoot.value){const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():undefined,bounds=paneRoot.value.getBoundingClientRect();if(range)markPosition.value={left:Math.max(8,Math.min(bounds.width-104,range.right-bounds.left-96)),top:Math.max(8,Math.min(bounds.height-40,range.bottom-bounds.top+5))};}}
function readingScroll(){annotations.pending.value=null;sync();}
watch([()=>props.zoom,rotate],()=>{annotations.pending.value=null;});
function addMark(kind:'highlight'|'note'){
 annotations.add(kind);
 if(kind==='note')notesOpen.value=true;
}
let textGeometryRevision = 0;
let textController=new AbortController();
let textFrame=0;
let textDisposed=false;
const measureCanvas=document.createElement('canvas');measureCanvas.width=1;measureCanvas.height=1;
const measureText=measureCanvas.getContext('2d');
let measuringFont='';
function cycleRotate() {
  const next = (((rotate.value + 90) % 360) as 0 | 90 | 180 | 270);
  setRotate(next);
}
async function submitPassword() {
  await unlock(passwordInput.value);
  passwordInput.value = "";
}
const highlightPages = computed(() => {
  const set = new Set<number>();
  for (const h of search.hits.value) set.add(h.page - 1);
  return set;
});
const activeHit = computed(() => search.hits.value[search.active.value]);
watch(
  () => search.active.value,
  () => {
    const hit = activeHit.value;
    if (hit) {
      jump(hit.page);
      highlightActiveHit();
    } else clearHitMarks();
  },
);
watch(search.hits,()=>{if(!search.hits.value.length)clearHitMarks();else highlightActiveHit();});
async function runSearch() {
  await search.run();
}

function markHitsInLayer(layer: HTMLElement, hit: SearchHit | undefined) {
  if (!hit) return;
  const spans = Array.from(layer.querySelectorAll<HTMLElement>("span"));
  clearHitMarks();
  let activeSet = false;
  for (const span of spans) {
    const text = span.textContent || "";
    const start = Number(span.dataset.textStart);
    const end = Number(span.dataset.textEnd);
    if(!Number.isFinite(start)||!Number.isFinite(end))continue;
    const s = hit.charOffset;
    const e = hit.charOffset + hit.length;
    if (e <= start || s >= end) continue;
    const localStart = Math.max(0, s - start);
    const localEnd = Math.min(text.length, e - start);
    if (localEnd <= localStart) continue;
    const before = text.slice(0, localStart);
    const mid = text.slice(localStart, localEnd);
    const after = text.slice(localEnd);
    span.replaceChildren();
    if (before) span.append(document.createTextNode(before));
    const mark = document.createElement("mark");
    mark.className = "pdf-hit";
    if (!activeSet) {
      mark.classList.add("is-active");
      activeSet = true;
    }
    mark.textContent = mid;
    span.append(mark);
    if (after) span.append(document.createTextNode(after));
  }
}

function clearHitMarks() {
  scroll.value?.querySelectorAll('.pdf-hit').forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent||'')));
  scroll.value?.querySelectorAll('.pdf-page.is-active-hit').forEach(page=>page.classList.remove('is-active-hit'));
}
function highlightActiveHit() {
  const hit = activeHit.value;
  if (!hit) return;
  void nextTick().then(() => {
    if(textDisposed||activeHit.value!==hit)return;
    scroll.value
      ?.querySelectorAll(".pdf-page.is-active-hit")
      .forEach((el) => el.classList.remove("is-active-hit"));
    scroll.value
      ?.querySelectorAll(".pdf-hit.is-active")
      .forEach((el) => el.classList.remove("is-active"));
    const pageEl = scroll.value?.querySelector<HTMLElement>(
      `.pdf-page[data-page="${hit.page - 1}"]`,
    );
    if (!pageEl) return;
    pageEl.classList.add("is-active-hit");
    const layer = pageEl.querySelector<HTMLElement>(".pdf-text-layer");
    if (layer?.dataset.built === "1") {
      markHitsInLayer(layer, hit);
      const mark =
        layer.querySelector<HTMLElement>(".pdf-hit.is-active") ||
        layer.querySelector<HTMLElement>(".pdf-hit");
      if (mark) {
        mark.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
    }
    pageEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

function resolveDestPage(dest: unknown): number | null {
  const doc = pdf.value;
  if (!doc) return null;
  try {
    const refObj = Array.isArray(dest) ? dest[0] : dest;
    if (typeof refObj === "number") return refObj + 1;
    if (refObj != null) {
      // sync path via getPageIndex is async; handled by caller
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function buildTextLayer(pageEl: HTMLElement, index: number) {
  const doc = pdf.value;
  if (!doc) return;
  const layer = pageEl.querySelector(".pdf-text-layer") as HTMLElement | null;
  if (!layer) return;
  const revision = String(textGeometryRevision);
  if (layer.dataset.geometry === revision &&
      (layer.dataset.built === "1" || layer.dataset.loading === revision)) return;
  layer.dataset.loading = revision;
  let annotHost = pageEl.querySelector<HTMLElement>(".pdf-annot-layer");
  if (!annotHost) {
    annotHost = document.createElement("div");
    annotHost.className = "pdf-annot-layer";
    annotHost.setAttribute("aria-hidden", "false");
    pageEl.append(annotHost);
  }
  annotHost.replaceChildren();
  try {
    const page = await doc.getPage(index + 1);
    if (!layer.isConnected || layer.dataset.loading !== revision || revision!==String(textGeometryRevision)) return;
    const content = await pageTextContent(doc, index + 1,1,textController.signal);
    if (!layer.isConnected || layer.dataset.loading !== revision || revision!==String(textGeometryRevision)) return;
    const cssW = pageEl.clientWidth || parseFloat(pageEl.style.width) || 1;
    const rotation = (page.rotate + rotate.value) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const viewport = page.getViewport({ scale: cssW / (base.width || 1), rotation });
    layer.replaceChildren();
    const items = content.items as Array<{
      str?: string;
      transform: number[];
      width?: number;
      height?: number;
      fontName?:string;
    }>;
    const offsets=new Map(mappedPdfText(content).items.map(item=>[item.index,item]));
    let fragment=document.createDocumentFragment();
    let batch=0;
    for (let itemIndex=0;itemIndex<items.length;itemIndex++) {
      const item=items[itemIndex];
      if(textDisposed||!layer.isConnected||layer.dataset.loading!==revision||revision!==String(textGeometryRevision))return;
      if (!item.str) continue;
      const tx = Util.transform(viewport.transform,item.transform);
      const fontH = Math.hypot(tx[2], tx[3]) || 12;
      const font=content.styles[item.fontName||''];
      const angle=Math.atan2(tx[1],tx[0])+(font?.vertical?Math.PI/2:0);
      const ascent=fontH*(font?.ascent??(font?.descent!==undefined?1+font.descent:0.8));
      const span = document.createElement("span");
      span.textContent = item.str;
      const offset=offsets.get(itemIndex)!;
      span.dataset.textStart=String(offset.start);span.dataset.textEnd=String(offset.end);
      const style = span.style;
      style.left = tx[4]+ascent*Math.sin(angle) + "px";
      style.top = tx[5]-ascent*Math.cos(angle) + "px";
      style.fontSize = fontH + "px";
      style.fontFamily=font?.fontFamily||'sans-serif';
      style.lineHeight='1';style.height=fontH+'px';
      const fontSignature=`${fontH}px ${style.fontFamily}`;
      if(measureText&&fontSignature!==measuringFont){measureText.font=fontSignature;measuringFont=fontSignature;}
      const measured=measureText?.measureText(item.str).width||1;
      const advance=(font?.vertical?item.height:item.width)||measured/viewport.scale;
      style.width=measured+'px';
      style.transform=`rotate(${angle}rad) scaleX(${advance*viewport.scale/measured})`;
      fragment.append(span);
      if(++batch%200===0) {
        layer.append(fragment);fragment=document.createDocumentFragment();
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
    }
    layer.append(fragment);
    layer.dataset.built = "1";
    layer.dataset.geometry = revision;
    delete layer.dataset.loading;

    // Item 2: link annotations (GoTo / URI)
    try {
      const annotations = await page.getAnnotations();
      if (!layer.isConnected || layer.dataset.geometry !== revision || revision!==String(textGeometryRevision)) return;
      for (const ann of annotations) {
        if (!ann || !ann.rect) continue;
        const kind = (ann as { subtype?: string }).subtype || "";
        const url = (ann as { url?: string }).url;
        const dest = (ann as { dest?: unknown }).dest;
        const isLink =
          kind === "Link" || ann.subtype === undefined || url || dest;
        if (!isLink && !url && dest == null) continue;
        const rect = ann.rect as number[];
        const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]);
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        if (width < 2 || height < 2) continue;
        const a = document.createElement("a");
        a.style.left = left + "px";
        a.style.top = top + "px";
        a.style.width = width + "px";
        a.style.height = height + "px";
        if (url && /^https?:\/\//i.test(url)) {
          a.href = url;
          a.title = url;
          a.addEventListener("click", (e) => {
            e.preventDefault();
            void window.localPreview.openExternal(url).catch(() => {});
          });
        } else if (dest != null) {
          a.href = "#";
          a.title = "跳到文档内目标";
          a.addEventListener("click", (e) => {
            e.preventDefault();
            void (async () => {
              let target: number | null = resolveDestPage(dest);
              if (target == null) {
                const refObj = Array.isArray(dest) ? dest[0] : dest;
                if (refObj != null && typeof refObj !== "number") {
                  target =
                    (await doc.getPageIndex(refObj as never)) + 1;
                }
              }
              if (target) jump(target);
            })();
          });
        } else {
          continue;
        }
        annotHost!.append(a);
      }
    } catch {
      /* annotations optional */
    }
  } catch {
    if(layer.dataset.loading === revision) {
      layer.dataset.built = "";
      delete layer.dataset.loading;
    }
  }
}

// Always build text layers when visible pages change or PDF loads (item 1)
async function syncVisibleText(revision: number) {
  await nextTick();
  if (textDisposed || revision !== textGeometryRevision) return;
  const elements = Array.from(scroll.value?.querySelectorAll<HTMLElement>(".pdf-page") || []);
  elements.sort((a,b)=>Math.abs(Number(a.dataset.page)+1-current.value)-Math.abs(Number(b.dataset.page)+1-current.value));
  for (const el of elements) {
    if (textDisposed || revision !== textGeometryRevision) return;
    await buildTextLayer(el, Number(el.dataset.page));
  }
  if (revision === textGeometryRevision) highlightActiveHit();
}
function scheduleText() {
  if(textFrame||textDisposed)return;
  textFrame=requestAnimationFrame(()=>{textFrame=0;void syncVisibleText(textGeometryRevision);});
}
watch([visiblePages, pdf], scheduleText);
watch(textGeometry, () => {
  textController.abort();textController=new AbortController();
  textGeometryRevision++;
  scheduleText();
});
const activePdf=()=>presentation.value||!!scroll.value?.closest<HTMLElement>('.preview-tab')&&getComputedStyle(scroll.value.closest<HTMLElement>('.preview-tab')!).display!=='none';
const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"]');
async function togglePresentation(value=!presentation.value,restore=true){
  if(value===presentation.value)return;
  clearTimeout(readingRestore);
  const leavingPage=current.value,interaction=readingInteraction;
  if(value){priorFullscreen=document.documentElement.classList.contains('immersive');searchOpen.value=false;presentation.value=true;document.documentElement.classList.add('pdf-presentation-active');
    try{await window.localPreview.setFullscreen(true);}catch{presentation.value=false;document.documentElement.classList.remove('pdf-presentation-active');}
  } else {presentation.value=false;document.documentElement.classList.remove('pdf-presentation-active');if(restore)await window.localPreview.setFullscreen(priorFullscreen);}
  await nextTick();scroll.value?.focus();
  if(!value){
    jump(leavingPage);
    // The shared fullscreen container restores raw scroll after 150ms. Reapply
    // the physical page once it settles, unless the reader has since interacted.
    readingRestore=setTimeout(()=>{if(!textDisposed&&!presentation.value&&interaction===readingInteraction)jump(leavingPage);},220);
  }
}
function onKeydown(event:KeyboardEvent){
  if(!activePdf()||editable(event.target)||event.altKey||event.metaKey)return;
  cancelReadingRestore();
  if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopImmediatePropagation();void togglePresentation();return;}
  if(presentation.value){
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();void togglePresentation(false);}
    else if(['ArrowRight','ArrowDown','PageDown',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();jump(current.value+1);}
    else if(['ArrowLeft','ArrowUp','PageUp'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();jump(current.value-1);}
    else if(event.ctrlKey&&['Tab','f','p'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();}
  }
  let handled=true;
  if(event.key==='Home')jump(1);
  else if(event.key==='End')jump(pages.value.length);
  else if(!presentation.value&&event.key==='PageDown')jump(current.value+1);
  else if(!presentation.value&&event.key==='PageUp')jump(current.value-1);
  else if(!presentation.value&&event.ctrlKey&&['=','+','-','0'].includes(event.key))emit('update:zoom',event.key==='0'?100:Math.max(25,Math.min(400,props.zoom+(event.key==='-'?-10:10))));
  else if(!event.ctrlKey&&event.key.toLowerCase()==='r')setRotate(((rotate.value+(event.shiftKey?270:90))%360) as 0|90|180|270);
  else handled=false;
  if(handled){event.preventDefault();event.stopPropagation();}
}
function onWheel(event:WheelEvent){
  annotations.pending.value=null;
  cancelReadingRestore();
  if(!event.ctrlKey&&event.deltaY!==0)releasePageFocus();
  if(presentation.value){event.preventDefault();return;}
  if(!event.ctrlKey||event.deltaY===0)return;
  event.preventDefault();emit('update:zoom',Math.max(25,Math.min(400,props.zoom+(event.deltaY<0?10:-10))));
}
function presentationClick(event:MouseEvent){
  if(!presentation.value||event.button!==0)return;
  event.preventDefault();jump(current.value+1);
}
function presentationBack(event:MouseEvent){if(presentation.value){event.preventDefault();jump(current.value-1);}}
function handleOpenSearch(e: Event) {
  if ((e as CustomEvent<string>).detail !== props.file.id) return;
  searchOpen.value = true;
  void nextTick(()=>document.querySelector<HTMLInputElement>(`[data-file-id="${props.file.id}"] .pdf-search-input`)?.focus({preventScroll:true}));
}
onMounted(() => {
  window.addEventListener("pdf:open-search", handleOpenSearch);
  window.addEventListener('keydown',onKeydown,true);
  fullscreenCleanup=window.localPreview.onFullscreen(value=>{if(!value&&presentation.value)void togglePresentation(false,false);});
});
onBeforeUnmount(() => {
  clearTimeout(readingRestore);
  fullscreenCleanup?.();window.removeEventListener('keydown',onKeydown,true);
  if(presentation.value){document.documentElement.classList.remove('pdf-presentation-active');void window.localPreview.setFullscreen(priorFullscreen);}
  exportController.abort();
  textDisposed=true;textGeometryRevision++;textController.abort();cancelAnimationFrame(textFrame);
  measureCanvas.width=0;measureCanvas.height=0;
  window.removeEventListener("pdf:open-search", handleOpenSearch);
});
</script>
<template>
  <section ref="paneRoot" class="pdf-pane" :class="{'pdf-presentation':presentation}" :aria-label="presentation?'PDF 演示模式（Esc 退出）':'PDF 预览'">
    <Teleport
      :to="`[data-file-id='${props.file.id}'] .module-tools`"
      defer
    >
      <span class="pdf-inline-tools" data-pdf-toolbar>
        <span class="preview-tool-group" data-pdf-group="navigation"><ToolButton class="pdf-nav-toggle" icon="navigation" :pressed="navOpen" title="目录 / 缩略图" @click="navOpen=!navOpen" /></span>
        <span class="preview-tool-group" data-pdf-group="query">
        <PdfSearch
          :target="`[data-file-id='${props.file.id}'] .floating-tools`"
          v-model:open="searchOpen"
          :query="search.query.value"
          :count="search.count.value"
          :active="search.active.value"
          :searching="search.searching.value"
          :error="search.error.value"
          :notice="search.notice.value"
          :case-sensitive="search.caseSensitive.value"
          :mode="search.mode.value"
          @update:case-sensitive="v=>{search.caseSensitive.value=v;void runSearch()}"
          @update:mode="v=>{search.mode.value=v;void runSearch()}"
          @update:query="(v) => (search.query.value = v)"
          @search="runSearch"
          @next="search.next()"
          @prev="search.prev()"
          @clear="search.clear()"
        />
        <ToolButton class="pdf-notes-toggle" icon="note" :pressed="notesOpen" :title="'本次批注（'+annotations.notes.value.length+'）'" @click="notesOpen=!notesOpen" /></span>
        <span class="preview-tool-group" data-pdf-group="view"><ToolButton class="pdf-rotate" icon="rotate" :title="'临时旋转（当前 '+rotate+'°）'" @click="cycleRotate" /><ToolButton class="pdf-present" icon="presentation" title="演示模式（Ctrl+Shift+P，Esc 退出）" @click="togglePresentation()" /></span>
      </span>
    </Teleport>
    <div v-if="annotations.pending.value&&!presentation" class="pdf-selection-actions" role="toolbar" aria-label="标注所选文字" :style="{left:markPosition.left+'px',top:markPosition.top+'px'}"><ToolButton class="pdf-mark-highlight" icon="highlight" title="高亮所选文字" @click="addMark('highlight')" /><ToolButton class="pdf-mark-note" icon="note" title="为所选文字添加备注" @click="addMark('note')" /><ToolButton icon="cancel" title="取消文字标注" @click="annotations.pending.value=null" /></div>
    <form
      v-if="needPassword"
      class="pdf-password"
      @submit.prevent="submitPassword"
    >
      <strong>PDF 受密码保护</strong>
      <p v-if="passwordError" role="alert">{{ passwordError }}</p>
      <input
        v-model="passwordInput"
        type="password"
        aria-label="PDF 密码"
        placeholder="输入打开密码"
        autocomplete="off"
      />
      <button type="submit">解锁预览</button>
      <small>密码仅用于本次内存解密，不会写入设置或磁盘。</small>
    </form>
    <div v-else class="pdf-body">
      <PdfNav
        v-if="navOpen && pdf && !presentation"
        :pdf="pdf"
        :current="current"
        @jump="jump"
      />
      <PdfNotes v-if="notesOpen && !presentation" :notes="annotations.notes.value" :can-export="!!pdf && !!annotations.onPage(current).length" :exporting="exporting" :export-status="exportStatus" @export="exportNotes" @jump="jump" @remove="annotations.remove"/>
      <div
        ref="scroll"
        class="pdf-scroll"
        :data-layout="pageLayout"
        :class="{'is-panning':panning}"
        tabindex="0"
        @scroll.passive="readingScroll"
        @wheel="onWheel"
        @click="presentationClick"
        @contextmenu="presentationBack"
        @mouseup="captureNotes"
      >
        <div v-if="padTop > 0" class="pdf-virtual-pad" :style="{ height: padTop + 'px' }" aria-hidden="true"></div>
        <div v-for="row in visibleRows" :key="row.pages.join('-')" class="pdf-row" role="group" :aria-label="row.pages.map(i=>'第 '+(i+1)+' 页').join('、')" :data-pages="row.pages.map(i=>i+1).join(',')" :style="rowDimensions(row)">
        <div
          v-for="index in row.pages"
          :key="index"
          class="pdf-page preview-content"
          :class="{
            'is-current-page':current===index+1,
            'has-hit': highlightPages.has(index),
            'is-active-hit': activeHit?.page === index + 1,
          }"
          :data-page="index"
          @pointerdown="selectReadingPage(index)"
          :style="dimensions(index)"
        >
          <canvas :aria-label="'PDF 第 ' + (index + 1) + ' 页'"></canvas>
          <div class="pdf-text-layer"></div>
          <div class="pdf-user-layer" aria-hidden="true"><template v-for="mark in annotations.onPage(index+1)" :key="mark.id"><span v-for="(rect,i) in mark.rects" :key="i" class="pdf-user-mark" :class="mark.kind" :style="annotations.rectStyle(mark,rect,rotate)"></span></template></div>
        </div>
        </div>
        <div v-if="padBottom > 0" class="pdf-virtual-pad" :style="{ height: padBottom + 'px' }" aria-hidden="true"></div>
      </div>
    </div>
    <PageNavigation
      :current="current"
      :total="pages.length"
      label="PDF"
      @jump="jump"
    />
    <p v-if="!allowPrint" class="pdf-perm-note" role="status">
      此文档不允许打印
    </p>
  </section>
</template>
