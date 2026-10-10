<script setup lang="ts">
import { ref, watch } from "vue";
import { clampZoom } from "../composables/zoom";
import ToolButton from './ToolButton.vue';
const props = defineProps<{ modelValue: number }>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const draft = ref(String(props.modelValue));
watch(
  () => props.modelValue,
  (v) => (draft.value = String(v)),
);
function apply() {
  const number = Number(draft.value);
  const value =
    Number.isFinite(number) && draft.value.trim()
      ? clampZoom(number)
      : props.modelValue;
  draft.value = String(value);
  emit("update:modelValue", value);
}
</script>
<template>
  <div class="zoom-control">
    <ToolButton icon="minus" title="缩小"
      @click="emit('update:modelValue', clampZoom(modelValue - 10))"
    /><label
      ><input
        :value="draft"
        @input="draft = ($event.target as HTMLInputElement).value"
        inputmode="decimal"
        type="number"
        min="25"
        max="400"
        aria-label="缩放比例"
        @change="apply"
        @blur="apply"
        @keydown.enter.prevent="apply"
      />%</label
    ><ToolButton icon="plus" title="放大"
      @click="emit('update:modelValue', clampZoom(modelValue + 10))"
    /><ToolButton class="fit-button" icon="reset" title="重置缩放为 100%" @click="emit('update:modelValue',100)" />
  </div>
</template>
