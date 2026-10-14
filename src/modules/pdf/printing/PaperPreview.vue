<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, toRaw } from "vue";
import { acquireCachedPdf } from "../core/docCache";
import type { RenderTask } from "pdfjs-dist";
import { pdfWork } from "../core/workQueue";
import { availablePdfPixels, allocatePdfCanvas, releasePdfCanvas } from '../core/canvasPool';
import type { PreviewFile } from "@shared/contracts";
import {
  paperSize,
  selectedPages,
  applyPageOrder,
  type PdfPrintOptions,
} from "@shared/printing";
import { pdfRasterPlan } from './rasterPlan';

const props = defineProps<{ file: PreviewFile; options: PdfPrintOptions }>();
/** Coalesce obsolete draws per row; shared queue limits expanded rows. */
let drawChain: Promise<void> = Promise.resolve();
const canvas = ref<HTMLCanvasElement>();
const error = ref("");
let disposed = false;
let releaseLease: (() => void) | undefined;
let task: RenderTask | undefined;
let revision = 0;
let leasePromise: ReturnType<typeof acquireCachedPdf> | undefined;
let drawing=new AbortController();

const paper = computed(() => paperSize(props.options));
const scaleLabel = computed(
  () =>
    ({
      fit: "适合纸张",
      actual: "实际大小 100%",
      shrink: "仅缩小",
    })[props.options.scale || "fit"],
);
const label = computed(
  () =>
    `${props.options.paper}${props.options.landscape ? " 横" : " 纵"} · ${scaleLabel.value}`,
);

function draw() {
  drawing.abort();drawing=new AbortController();
  const signal=drawing.signal;
  const token = ++revision;
  task?.cancel();
  drawChain = drawChain.then(() => token === revision && !disposed ? drawNow(token,signal) : undefined).catch(() => {});
  return drawChain;
}
async function drawNow(token: number,signal:AbortSignal) {
  if (!canvas.value) return;
  error.value = "";
  try {
    if (!leasePromise) leasePromise = (async () => {
      const source = await window.localPreview.loadPreview(toRaw(props.file));
      if (source.error) throw Error(source.error);
      return acquireCachedPdf(props.file.id, source.bytes,{password:source.view?.pdfPassword||props.file.view?.pdfPassword});
    })().then(lease => {
      if (disposed) lease.release();
      else releaseLease = lease.release;
      return lease;
    }).catch(error => { leasePromise = undefined; throw error; });
    const { doc: pdf } = await leasePromise;
    if (disposed || token !== revision) return;
    const ranged = selectedPages(props.options.range || "", pdf.numPages);
    const pages = applyPageOrder(ranged, props.options.pageOrder || "forward");
    const pageNum = pages[0] || 1;
    const page = await pdf.getPage(pageNum);
    if (disposed || token !== revision) return;
    const original = page.getViewport({ scale: 1 });
    await pdfWork(4, async () => {
      if (disposed || token !== revision || !canvas.value) return;
      const c = canvas.value;
      const pixels=availablePdfPixels(c);
      if(pixels<4)return;
      const dpr=Math.min(2,devicePixelRatio);
      let raster=pdfRasterPlan(original,paper.value,props.options.scale||'fit',0.55*25.4*dpr);
      if(raster.width*raster.height>pixels)raster=pdfRasterPlan(original,paper.value,props.options.scale||'fit',0.55*25.4*dpr*Math.sqrt(pixels/(raster.width*raster.height)));
      const viewport=page.getViewport({scale:raster.scale});
      if(!allocatePdfCanvas(c,raster.width,raster.height))return;
      c.style.width=raster.widthMm*0.55+'px';c.style.height=raster.heightMm*0.55+'px';
      task = page.render({ canvas: c, viewport,transform:raster.transform });
      await task.promise;
    },signal);
  } catch (e) {
    if (!disposed && token === revision && !['RenderingCancelledException','AbortError'].includes((e as {name?:string})?.name||''))
      error.value = e instanceof Error ? e.message : String(e);
  }
}

watch(
  () => [
    props.options.paper,
    props.options.landscape,
    props.options.range,
    props.options.scale,
    props.options.pageOrder,
  ],
  () => void draw(),
);
onMounted(() => void draw());
onBeforeUnmount(() => {
  disposed = true;
  drawing.abort();
  revision++;
  task?.cancel();
  releaseLease?.();
  if (canvas.value) releasePdfCanvas(canvas.value);
});
</script>
<template>
  <div class="paper-layout-preview" :title="label">
    <div
      class="paper-sheet"
      :style="{
        width: paper.width * 0.55 + 'px',
        height: paper.height * 0.55 + 'px',
      }"
    >
      <canvas ref="canvas"></canvas>
    </div>
    <small v-if="error" class="paper-layout-error">{{ error }}</small>
    <small v-else class="paper-caption">{{ label }}</small>
  </div>
</template>
