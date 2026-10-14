<script setup lang="ts">
import { computed, inject, ref, type Ref, type ShallowRef } from "vue";
import type { PreviewFile } from "@shared/contracts";
import { printError } from "@/components/printing/errorMessage";
import ToolButton from '@/components/ui/ToolButton.vue';
const props = defineProps<{ file: PreviewFile; disabled?: boolean }>();
const error = ref("");
const previewFiles = inject<ShallowRef<PreviewFile[]>>("previewFiles");
const allowPrintRef = inject<Ref<boolean>>("pdfAllowPrint");
const canPrint = computed(() => props.file.view?.pdfPrintAllowed !== false && allowPrintRef?.value !== false);
async function open() {
  try {
    const { printEntry } = await window.localPreview.getSettings();
    let files: PreviewFile[] = [];
    if (printEntry === "all") {
      const printable = new Set([
        "pdf",
        "png",
        "jpg",
        "jpeg",
        "webp",
        "gif",
        "bmp",
        "svg",
        "docx",
      ]);
      files = (previewFiles?.value || []).filter((f) => printable.has(f.ext));
    } else if (printEntry === "current") files = [props.file];
    await window.localPreview.openPrintPanel(files);
  } catch (e) {
    error.value = printError(e);
  }
}
</script>
<template>
  <span class="print-btn-wrap"
    ><ToolButton icon="print"
      class="pdf-print-button"
      :disabled="disabled || !canPrint"
      :title="disabled || !canPrint ? '此文档不允许打印' : '打印设置（独立窗口）'"
      @click="open"
    /><span v-if="error" role="alert">{{ error }}</span></span
  >
</template>
