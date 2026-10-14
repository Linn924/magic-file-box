<script setup lang="ts">
import PageNavigation from "@/components/preview/PageNavigation.vue";
import type { PreviewProps } from "@/modules/types";
import { usePreview } from "./composables/usePreview";
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const { pane, host, warning, page, pageCount, jump } = usePreview(props, emit);
</script>
<template>
  <section ref="pane" class="document-pane">
    <div v-if="warning" class="notice">{{ warning }}</div>
    <div class="document-scroll">
      <div ref="host" class="word-host"></div>
    </div>
    <PageNavigation
      :current="page"
      :total="pageCount"
      label="文档"
      @jump="jump"
    />
  </section>
</template>
