<script setup lang="ts">
import { ref } from "vue";
import ToolButton from './ToolButton.vue';
import type { PreviewFile } from "../../shared/contracts";
import { printError } from "../modules/pdf/print/errorMessage";
const props = defineProps<{ file: PreviewFile }>();
const error = ref("");
async function open() {
  try {
    if (props.file.ext === "doc") {
      error.value = "旧版 .doc 请先另存为 .docx 再打印。";
      return;
    }
    const { printEntry } = await window.localPreview.getSettings();
    const files = printEntry === "none" ? [] : [props.file];
    await window.localPreview.openPrintPanel(files);
  } catch (e) {
    error.value = printError(e);
  }
}
</script>
<template>
  <span class="print-btn-wrap"
    ><ToolButton icon="print"
      class="file-print-button"
      :title="file.ext==='doc'?'旧版 DOC 不支持打印':'打印设置（独立窗口）'"
      :disabled="file.ext==='doc'"
      @click="open"
    /><span v-if="error" role="alert">{{ error }}</span></span
  >
</template>
