<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, toRaw } from "vue";
import { acquireCachedPdf } from "../core/docCache";
import { pageSize } from "../core/metadata";
import type { PreviewFile } from "@shared/contracts";
import {
  paperSize,
  selectedPages,
  applyPageOrder,
  type PdfPrintOptions,
} from "@shared/printing";

const props = defineProps<{ file: PreviewFile; options: PdfPrintOptions }>();
const paper = computed(() => paperSize(props.options));
const pages = ref<
  Array<{ n: number; w: number; h: number; landscape: boolean }>
>([]);
const error = ref("");
const showAll = ref(false);
const MAX_SCAN = 40;
let disposed = false;
let releaseLease: (() => void) | undefined;
const lifetime=new AbortController();

const activePages = computed(() => {
  try {
    const ranged = selectedPages(props.options.range || "", pages.value.length || 1);
    return applyPageOrder(ranged, props.options.pageOrder || "forward");
  } catch {
    return [];
  }
});
const summary = computed(() => {
  if (!pages.value.length)
    return [] as Array<{ n: number; w: number; h: number; landscape: boolean }>;
  return showAll.value ? pages.value : pages.value.slice(0, 8);
});
const moreCount = computed(() => Math.max(0, pages.value.length - 8));

async function load() {
  error.value = "";
  pages.value = [];
  try {
    const source=await window.localPreview.loadPreview(toRaw(props.file));
    if(disposed||source.error)return;
    const lease = await acquireCachedPdf(props.file.id, source.bytes,{password:source.view?.pdfPassword||props.file.view?.pdfPassword});
    if (disposed) { lease.release(); return; }
    releaseLease = lease.release;
    const pdf = lease.doc;
    const n = Math.min(pdf.numPages, MAX_SCAN);
    for (let i = 1; i <= n; i++) {
      if (disposed) return;
      const v = await pageSize(pdf,i,3,lifetime.signal);
      if (disposed) return;
      pages.value.push({
        n: i,
        w: (v.width * 25.4) / 72,
        h: (v.height * 25.4) / 72,
        landscape: v.width > v.height,
      });
    }
  } catch {
    if (!disposed) error.value = "无法读取页面尺寸";
  }
}

onMounted(() => void load());
watch(
  () => [props.options.range, props.options.pageOrder],
  () => {
    /* recompute active list only */
  },
);
onBeforeUnmount(() => {
  disposed = true;
  lifetime.abort();
  releaseLease?.();
});
</script>
<template>
  <div class="page-dims">
    <p class="paper-dimensions">
      <template v-if="pages.length">
        {{ pages.length }}<template v-if="pages.length >= 40">+</template> 页 ·
        {{ options.paper }} {{ paper.width }} × {{ paper.height }} mm
      </template>
      <template v-else>{{ error || "读取尺寸…" }}</template>
    </p>
    <div v-if="summary.length" class="page-size-list">
      <div
        v-for="p in summary"
        :key="p.n"
        class="page-size-row"
        :class="{ active: activePages.includes(p.n) }"
      >
        <span class="page-n">{{ p.n }}</span>
        <span>{{ p.w.toFixed(0) }}×{{ p.h.toFixed(0) }} {{ p.landscape ? "横" : "纵" }}</span>
      </div>
      <button
        v-if="moreCount > 0 && !showAll"
        type="button"
        class="page-size-more"
        @click="showAll = true"
      >
        +{{ moreCount }}
      </button>
    </div>
  </div>
</template>
