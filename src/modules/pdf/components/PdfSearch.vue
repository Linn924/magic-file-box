<script setup lang="ts">
import {nextTick,ref,watch} from 'vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
const props=defineProps<{target:string;caseSensitive:boolean;mode:import('../core/searchIndex').SearchMode;notice:string;query:string;count:number;active:number;searching:boolean;error:string;open:boolean}>();
const input=ref<HTMLInputElement>();
watch(()=>props.open,async value=>{if(value){await nextTick();input.value?.focus({preventScroll:true});}});
const emit=defineEmits<{'update:query':[string];'update:caseSensitive':[boolean];'update:mode':[import('../core/searchIndex').SearchMode];search:[];next:[];prev:[];clear:[];'update:open':[boolean]}>();
function submit(event:Event){event.preventDefault();emit('search');}
</script>
<template>
  <span class="pdf-search"><ToolButton class="pdf-search-toggle" icon="search" :pressed="open" :aria-expanded="open" aria-haspopup="dialog" :title="open?'收起查找窗口':'查找文档内容（Ctrl+F）'" @click="emit('update:open',!open)" />
    <PreviewPanel :open="open" title="查找 PDF 内容" :target="target" trigger=".pdf-search-toggle" close-label="关闭文档搜索" @update:open="emit('update:open',$event)">
      <form class="pdf-search-bar" role="search" @submit="submit">
        <div class="query-primary"><input ref="input" class="pdf-search-input" :value="query" placeholder="输入要查找的内容" aria-label="搜索 PDF" @input="emit('update:query',($event.target as HTMLInputElement).value)" @keydown.enter.prevent="emit('search')" /><ToolButton class="pdf-search-go" icon="search" title="查找（Enter）" :disabled="searching" @click="emit('search')" /></div>
        <div class="query-options"><ToolButton class="pdf-search-case" icon="case" :pressed="caseSensitive" title="区分大小写" @click="emit('update:caseSensitive',!caseSensitive)" /><select class="pdf-search-mode" :value="mode" aria-label="搜索模式" title="搜索模式" @change="emit('update:mode',($event.target as HTMLSelectElement).value as import('./searchIndex').SearchMode)"><option value="plain">普通文字</option><option value="wildcard">通配符 * ?</option><option value="regex">正则表达式</option></select></div>
        <div class="query-results"><span class="pdf-search-count" aria-live="polite"><template v-if="searching">搜索中…</template><template v-else-if="query.trim()">{{count?active+1+' / '+count:'无结果'}}</template><template v-else>输入内容开始查找</template></span><ToolButton icon="up" title="上一处" :disabled="searching||!count" @click="emit('prev')" /><ToolButton icon="down" title="下一处" :disabled="searching||!count" @click="emit('next')" /><ToolButton icon="clear" title="清除搜索" @click="emit('clear')" /></div>
        <span v-if="notice" class="pdf-search-notice query-notice" role="status">{{notice}}</span><span v-if="error" class="pdf-search-error query-error" role="alert">{{error}}</span>
      </form>
    </PreviewPanel>
  </span>
</template>
