<script setup lang="ts">
defineProps<{name:string}>();
const paths:Record<string,string>={
  edit:'M3 11.5 10.5 4l2 2L5 13.5H3v-2ZM9.5 5l2 2M10.5 4l1-1a1.4 1.4 0 0 1 2 2l-1 1',
  preview:'M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4ZM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  save:'M3 2h8l3 3v9H2V2h1ZM5 2v4h6V2M5 14V9h6v5M9 3v2',
  undo:'M5 2 2 5l3 3M2 5h6a4 4 0 0 1 0 8',
  redo:'M11 2l3 3-3 3M14 5H8a4 4 0 0 0 0 8',
  copy:'M6 5h8v9H6V5ZM10 5V2H2v9h4',
  paste:'M6 3H3v11h10V3h-3M6 2h4v3H6V2M6 8h4M6 11h4',
  clear:'m2 9 6-6 6 6-5 5H7L2 9ZM5 6l6 6M9 14h5',
  left:'M2 3h12M2 6h8M2 9h12M2 12h8',
  center:'M2 3h12M4 6h8M2 9h12M4 12h8',
  right:'M2 3h12M6 6h8M2 9h12M6 12h8',
  insert:'M2 3h7v10H2V3M2 8h7M12 5v6M9 8h6',
  delete:'M2 3h7v10H2V3M2 8h7M10 8h5',
  row:'M2 3h12v10H2V3M2 6h12M2 10h12M6 3v10M10 3v10',
  column:'M2 3h12v10H2V3M6 3v10M10 3v10M2 6h12M2 10h12',
  above:'M3 6h10v7H3V6M3 9.5h10M8 1v3M6 3l2-2 2 2',
  below:'M3 3h10v7H3V3M3 6.5h10M8 12v3M6 13l2 2 2-2',
  before:'M6 3h7v10H6V3M9.5 3v10M1 8h3M3 6 1 8l2 2',
  after:'M3 3h7v10H3V3M6.5 3v10M12 8h3M13 6l2 2-2 2',
  custom:'M2 4h12M2 8h12M2 12h12M5 2v4M11 6v4M7 10v4',
  restore:'M2 3v4h4M2 7a6 6 0 1 1 1 5M8 5v4l3 1',
  check:'m3 8 3 3 7-7',
  cancel:'m4 4 8 8M12 4l-8 8',
  jump:'M2 8h10M8 4l4 4-4 4M14 3v10',
  more:'M3 8h.1M8 8h.1M13 8h.1',
  expand:'M4 6l4 4 4-4',
};
</script>
<template><svg class="excel-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" :stroke-width="name==='more'?3:1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect v-if="name==='row'" x="2" y="6" width="12" height="4" fill="currentColor" stroke="none" opacity=".25" /><rect v-if="name==='column'" x="6" y="3" width="4" height="10" fill="currentColor" stroke="none" opacity=".25" /><path :d="paths[name]||paths.more" /></svg></template>
