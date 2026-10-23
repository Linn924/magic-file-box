<script setup lang="ts">
import PageNavigation from "@/components/preview/PageNavigation.vue";
import type { PreviewProps } from "@/modules/types";
import { usePreview } from "./composables/usePreview";
import {useDocxNavigation} from './composables/useDocxNavigation';
import WordOutline from './components/WordOutline.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import {usePreviewNotice} from '@/composables/usePreviewNotice';
const props = defineProps<PreviewProps>();
const emit = defineEmits<{
  ready: [];
  error: [message: string];
  "update:zoom": [value: number];
}>();
const { pane, host, bodyRoot, scroll, warning, page, pageCount, jump, fit } = usePreview(props, emit);
usePreviewNotice('word-layout',warning);
const {available, showSearch, query, searchInput, showOutline, headings, activeHeading, count, index, searching, findNext, searchKey, jumpHeading, toggleOutline} = useDocxNavigation(props, pane, bodyRoot, scroll, fit);
</script>
<template>
  <section ref="pane" class="document-pane">
    <Teleport v-if="file.ext==='docx'" :to="`[data-file-id='${file.id}'] .module-tools`" defer>
      <span class="word-tools filebar-inline"><span class="preview-tool-group">
        <ToolButton class="word-outline-toggle" icon="navigation" title="显示 / 隐藏 DOCX 标题目录" :pressed="showOutline" :disabled="!available" @click="toggleOutline"/>
        <ToolButton class="word-search-toggle" icon="search" title="查找 DOCX 内容（Ctrl+F）" :pressed="showSearch" :disabled="!available" :aria-expanded="showSearch" aria-haspopup="dialog" @click="showSearch=!showSearch"/>
      </span></span>
    </Teleport>
    <PreviewPanel v-if="file.ext==='docx'" v-model:open="showSearch" title="查找 DOCX 内容" :target="`[data-file-id='${file.id}'] .floating-tools`" trigger=".word-search-toggle" close-label="关闭 DOCX 搜索">
      <div class="word-search-bar" role="search">
        <div class="query-primary"><input ref="searchInput" v-model="query" class="word-search-input" aria-label="搜索 DOCX" placeholder="搜索文档内容" @keydown.enter="searchKey"/><ToolButton icon="clear" title="清除搜索" :disabled="!query" @click="query=''"/></div>
        <div class="query-results"><span class="word-search-count" aria-live="polite">{{searching?'查找中…':query.trim()?(count?(index+1)+' / '+count+' 处匹配':'0 处匹配'):'输入内容开始查找'}}</span><ToolButton class="word-find-previous" icon="up" title="上一处匹配（Shift+Enter）" :disabled="!count||searching" @click="findNext(-1)"/><ToolButton class="word-find-next" icon="down" title="下一处匹配（Enter）" :disabled="!count||searching" @click="findNext(1)"/></div>
      </div>
    </PreviewPanel>
    <div class="word-body">
      <WordOutline v-if="file.ext==='docx'&&showOutline" :headings="headings" :active="activeHeading" @jump="jumpHeading"/>
      <div ref="scroll" class="document-scroll"><div ref="host" class="word-host"></div></div>
    </div>
    <PageNavigation
      :current="page"
      :total="pageCount"
      label="文档"
      @jump="jump"
    />
  </section>
</template>
