import { ref, shallowRef, computed, watch, triggerRef, onScopeDispose, getCurrentScope, type Ref } from "vue";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pageTextContent, canonicalPdfText, textCacheLimits } from "../core/textCache";
import { findPdfMatches, MAX_SEARCH_HITS, searchPattern, type SearchMode } from '../core/searchIndex';
import { PatternSearch } from '../core/patternSearch';

export interface SearchHit {
  /** 1-based page */
  page: number;
  /** char offset in page text */
  charOffset: number;
  length: number;
}

export function usePdfSearch(pdf: Ref<PDFDocumentProxy | undefined>) {
  const query = ref("");
  const searching = ref(false);
  const hits = shallowRef<SearchHit[]>([]);
  const active = ref(-1);
  const error = ref("");
  const cache = new Map<number, string>();
  const caseSensitive=ref(false);
  const mode=ref<SearchMode>('plain');
  const notice=ref('');
  let cacheBytes=0;
  let controller = new AbortController();
  let searchRevision = 0;

  async function pageText(n: number,signal?:AbortSignal) {
    let text = cache.get(n);
    if (text !== undefined) {
      cache.delete(n);
      cache.set(n,text);
      return text;
    }
    const doc = pdf.value;
    if (!doc) return "";
    const content = await pageTextContent(doc, n, 3,signal);
    if (pdf.value !== doc) return "";
    text = canonicalPdfText(content);
    cacheBytes-=(cache.get(n)?.length||0)*2;
    cache.set(n, text);
    cacheBytes+=text.length*2;
    while(cache.size>1&&(cache.size>textCacheLimits(doc.numPages).pages||cacheBytes>textCacheLimits(doc.numPages).bytes)) {
      const oldest=cache.keys().next().value!;cacheBytes-=cache.get(oldest)!.length*2;cache.delete(oldest);
    }
    return text;
  }

  async function run(value = query.value) {
    controller.abort();controller=new AbortController();
    const signal=controller.signal;
    query.value = value;
    error.value = "";
    notice.value = "";
    hits.value = [];
    active.value = -1;
    const rev = ++searchRevision;
    const q = value.trim();
    searching.value = false;
    const doc = pdf.value;
    if (!q || !doc) return;
    searching.value = true;
    const options={caseSensitive:caseSensitive.value,mode:mode.value};
    const patterns=new PatternSearch();
    let characters=0;
    try {
      if(options.mode!=='plain')new RegExp(searchPattern(q,options.mode),options.caseSensitive?'gu':'giu');
      const found: SearchHit[] = [];

      let lastPublish = performance.now();
      for (let n = 1; n <= doc.numPages; n++) {
        if (rev !== searchRevision) return;
        const text = await pageText(n,signal);
        if (rev !== searchRevision) return;
        characters+=text.trim().length;
        const matches=options.mode==='plain'?findPdfMatches(text,q,options,MAX_SEARCH_HITS-found.length):await patterns.matches(text,q,options,MAX_SEARCH_HITS-found.length,signal);
        if(rev!==searchRevision)return;
        for(const match of matches)found.push({page:n,...match});
        if(found.length!==hits.value.length &&
          (active.value === -1 || performance.now() - lastPublish >= 100 || n === doc.numPages)){
          // Append only new hits; avoid re-copying the whole result list every tick.
          const prev = hits.value.length;
          for(let i=prev;i<found.length;i++)hits.value.push(found[i]);
          triggerRef(hits);
          lastPublish = performance.now();
          if(active.value===-1)active.value=0;
        }
        if(found.length>=MAX_SEARCH_HITS){notice.value='结果已达 50000 处，请缩小搜索范围。';break;}
        if (n % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      if(rev===searchRevision&&!characters)notice.value='当前文档未包含可提取文字层（疑似扫描件），不支持文字检索。';
      if (rev === searchRevision) { for(let i=hits.value.length;i<found.length;i++)hits.value.push(found[i]);triggerRef(hits); }
    } catch (e) {
      if (rev === searchRevision)
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
      patterns.close();
      if (rev === searchRevision) searching.value = false;
    }
  }

  function next() {
    if (!hits.value.length) return;
    active.value = (active.value + 1) % hits.value.length;
  }
  function prev() {
    if (!hits.value.length) return;
    active.value =
      (active.value - 1 + hits.value.length) % hits.value.length;
  }
  function clear() {
    controller.abort();
    searchRevision++;
    searching.value = false;
    query.value = "";
    hits.value = [];
    active.value = -1;
    error.value = "";notice.value="";
  }
  watch(pdf, () => { clear(); cache.clear();cacheBytes=0; });
  if (getCurrentScope()) onScopeDispose(() => { clear(); cache.clear();cacheBytes=0; });
  return {
    query,caseSensitive,mode,notice,
    searching,
    hits,
    count:computed(()=>hits.value.length),
    active,
    error,
    run,
    next,
    prev,
    clear,
    pageText,
    cacheSize:()=>cache.size,
  };
}
