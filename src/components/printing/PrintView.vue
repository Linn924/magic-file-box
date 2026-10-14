<script setup lang="ts">
import {onMounted, onBeforeUnmount, ref} from 'vue';
import type {PrintRenderer, PrintRenderContext} from '@/types/printing';
const host = ref<HTMLElement>();
let disposed = false;
let renderer: PrintRenderer | undefined;
let jobToken: string | undefined;

onMounted(async () => {
  try {
    const job = await window.localPreview.consumePrint();
    jobToken = job.token;
    if(disposed || !host.value) return;
    host.value.dataset.jobToken = jobToken;
    const context: PrintRenderContext = {
      host: host.value,
      isDisposed: () => disposed,
      ready: () => window.localPreview.printReady(undefined, jobToken),
    };
    const create = job.file.ext === 'pdf'
      ? (await import('@/modules/pdf/printing')).createPdfPrintRenderer
      : job.file.ext === 'docx'
        ? (await import('@/modules/word/printing')).createWordPrintRenderer
        : (await import('@/modules/image/printing')).createImagePrintRenderer;
    if(disposed) return;
    renderer = create(context);
    await renderer.render(job);
  } catch(error) {
    if(!disposed) await window.localPreview.printReady(error instanceof Error ? error.message : String(error), jobToken);
  }
});
onBeforeUnmount(() => {
  disposed = true;
  renderer?.dispose();
  host.value?.replaceChildren();
});
</script>
<template><div ref="host" class="pdf-print-document"></div></template>
