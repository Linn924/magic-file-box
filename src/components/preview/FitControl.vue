<script setup lang="ts">
import type { FitMode } from "@/utils/fit";
defineProps<{ modelValue: FitMode }>();
defineEmits<{ "update:modelValue": [mode: FitMode] }>();
</script>
<template>
  <select
    aria-label="页面适配"
    title="页面适配：默认显示 / 适合宽度 / 整页适配"
    :value="modelValue"
    @change="
      $emit(
        'update:modelValue',
        ($event.target as HTMLSelectElement).value as FitMode,
      )
    "
  >
    <option value="original">默认显示</option>
    <option value="width">适合宽度</option>
    <option value="page">整页适配</option>
  </select>
</template>
