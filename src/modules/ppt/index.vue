<script setup lang="ts">
import { previewError } from '@shared/previewError';
import { usePreviewTask, previewFrame } from '@/composables/usePreviewTask';
import { fitScale } from "@/utils/fit";
import { createSafeResizeObserver } from "@/utils/safeResizeObserver";
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from "vue";
import type { PreviewProps } from "@/modules/types";
import { openSlides, type SlidesRenderer } from "./core/renderer";
import { snapshotSlide } from "./core/snapshot";
import PageNavigation from "@/components/preview/PageNavigation.vue";
import { useContinuousPages } from "@/composables/useContinuousPages";
const props = defineProps<PreviewProps>();
const task = usePreviewTask();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const viewport = ref<HTMLElement>(),
  host = ref<HTMLElement>();
const count = ref(0);
let renderer: SlidesRenderer | undefined,
  resizeObserver: ResizeObserver | undefined,
  intersectObserver: IntersectionObserver | undefined,
  disposed = false;
let stage: HTMLElement;
let shadow: ShadowRoot;
/** 所有页面 div（占位或已渲染），顺序与幻灯片一致 */
let pageElements: HTMLElement[] = [];
/** 记录已完成 render+snapshot 的页码（0-based） */
const rendered = new Set<number>();
/** 正在进行的懒渲染任务（0-based index → Promise） */
const rendering = new Map<number, Promise<void>>();
let renderQueue=Promise.resolve();
let jumpRevision=0;

const { current, sync, jump: jumpPages } = useContinuousPages(
  viewport,
  () => pageElements,
);

/** 计算当前缩放比例 */
function computeScale(): number {
  if (!renderer || !viewport.value?.clientWidth) return 1;
  return (
    fitScale(
      renderer.width,
      renderer.height,
      viewport.value.clientWidth - 48,
      viewport.value.clientHeight - 48,
      props.fitMode || "original",
      Math.min(
        (viewport.value.clientWidth - 48) / renderer.width,
        (viewport.value.clientHeight - 48) / renderer.height,
      ),
    ) *
    props.zoom
  ) / 100;
}

function applyFitToPage(el: HTMLElement, scale: number) {
  if (!renderer) return;
  el.style.width = renderer.width * scale + "px";
  el.style.height = renderer.height * scale + "px";
  // 已渲染页有真实内容（firstElementChild 是克隆体）
  const body = el.firstElementChild as HTMLElement | null;
  if (body) {
    body.style.width = renderer.width + "px";
    body.style.height = renderer.height + "px";
    body.style.transform = `scale(${scale})`;
    body.style.transformOrigin = "top left";
  }
  // 占位页：只设外框尺寸，内部为空
}

function fit() {
  const scale = computeScale();
  for (const el of pageElements) applyFitToPage(el, scale);
}

/** 懒渲染指定页（0-based），幂等：已渲染直接返回 */
function lazyRender(index: number): Promise<void> {
  if (rendered.has(index)) return Promise.resolve();
  const existing = rendering.get(index);
  if (existing) return existing;

  const task = renderQueue.then(async () => {
    if (disposed || !renderer) return;
    await renderer.render(index);
    if (disposed) return;
    const placeholder = pageElements[index];
    if (!placeholder) return;
    const copy = snapshotSlide(stage, index);
    // 清空占位内容并替换为真实快照
    placeholder.replaceChildren(copy);
    rendered.add(index);
    // 应用当前缩放
    applyFitToPage(placeholder, computeScale());
  }).catch(error=>{if(!disposed)emit('error',previewError(error,'演示文稿'));});
  renderQueue=task;
  void task.finally(()=>{if(rendering.get(index)===task)rendering.delete(index);}).catch(()=>{});

  rendering.set(index, task);
  return task;
}

/** 设置 IntersectionObserver，进入视口时触发懒渲染 */
function setupIntersectObserver() {
  intersectObserver?.disconnect();
  intersectObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const idx = Number((entry.target as HTMLElement).dataset.page);
        if (Number.isFinite(idx)) void lazyRender(idx);
      }
    },
    { root: viewport.value, rootMargin: "400px" },
  );
  for (const el of pageElements) intersectObserver.observe(el);
}

/** 跳转到指定页（1-based），确保目标页已渲染后再滚动 */
async function jump(value: number) {
  const request=++jumpRevision;
  const index = Math.max(0, Math.min(pageElements.length, Math.floor(value) || 1) - 1);
  // 强制渲染目标页（及相邻页），让滚动后画面不为空
  await Promise.all([
    lazyRender(index),
    index > 0 ? lazyRender(index - 1) : Promise.resolve(),
    index < pageElements.length - 1 ? lazyRender(index + 1) : Promise.resolve(),
  ]);
  if(!disposed&&request===jumpRevision)jumpPages(value);
}

onMounted(async () => {
  try {
    shadow = host.value!.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent =
      "*{box-sizing:border-box;scrollbar-width:none}::-webkit-scrollbar{display:none}a{pointer-events:none}" +
      ".slide-page{position:relative;margin:0 auto 24px;background:white;overflow:hidden;box-shadow:0 3px 18px #0002}" +
      ".slide-placeholder{background:var(--stage,#dce2ea);border-radius:4px}" +
      ".render-stage{position:absolute;left:-100000px;top:0;visibility:hidden}";
    shadow.append(style);
    stage = document.createElement("div");
    stage.className = "render-stage";
    shadow.append(stage);

    renderer = await openSlides(props.file.bytes, props.file.ext, stage);
    if (disposed) {
      renderer.dispose();
      return;
    }
    count.value = renderer.count;
    const scale = computeScale();
    task.report('rendering');
    await previewFrame(task.signal);
    if (disposed) return;

    // 渲染第 1 页（index 0），让用户立即看到内容
    await renderer.render(0);
    if (disposed) return;

    for (let i = 0; i < count.value; i++) {
      const page = document.createElement("div");
      page.dataset.page = String(i);

      if (i === 0) {
        // 第 1 页：已渲染，插入真实快照
        page.className = "slide-page preview-content";
        const copy = snapshotSlide(stage, 0);
        page.append(copy);
        rendered.add(0);
      } else {
        // 其余页：骨架占位，等待 IntersectionObserver 触发
        page.className = "slide-page slide-placeholder preview-content";
      }

      shadow.insertBefore(page, stage);
      pageElements.push(page);
      applyFitToPage(page, scale);
    }

    setupIntersectObserver();

    resizeObserver = createSafeResizeObserver(fit);
    resizeObserver.observe(viewport.value!);
    fit();
    emit("ready");
  } catch (e) {
    if (!disposed && !task.signal.aborted) emit("error", previewError(e, '演示文稿'));
  }
});

watch(() => props.zoom, fit);
watch(
  () => props.fitMode,
  async () => {
    const page = current.value;
    fit();
    await nextTick();
    jumpPages(page);
  },
);
onBeforeUnmount(() => {
  disposed = true;
  intersectObserver?.disconnect();
  resizeObserver?.disconnect();
  renderer?.dispose();
  pageElements = [];
  rendered.clear();
  rendering.clear();
  host.value?.shadowRoot?.replaceChildren();
});
</script>
<template>
  <section class="presentation-pane">
    <div ref="viewport" class="slide-scroll" @scroll.passive="sync">
      <div ref="host" class="slide-host"></div>
    </div>
    <PageNavigation
      :current="current"
      :total="count"
      label="幻灯片"
      @jump="jump"
    />
  </section>
</template>
