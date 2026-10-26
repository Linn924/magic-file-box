import assert from 'node:assert/strict';
import {shallowRef} from 'vue';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {textCacheLimits} from '../core/textCache';
import {usePdfSearch} from '../composables/useSearch';

const pdf={numPages:120,getPage:async()=>({getTextContent:async()=>({items:[{str:'needle '.repeat(20)}]})})} as unknown as PDFDocumentProxy;
const search=usePdfSearch(shallowRef(pdf));
await search.run('needle');
assert.equal(search.hits.value.length,2400,'each hit must remain reachable');
assert.ok(search.cacheSize()<=textCacheLimits(120).pages,'search text cache must remain bounded');
assert.equal(search.searching.value,false);
await search.run('missing');
assert.equal(search.hits.value.length,0);
assert.ok(search.cacheSize()<=textCacheLimits(120).pages);
console.log('PASS PDF search: 2400 hits across 120 pages, bounded text cache');

let releaseText!: () => void;
let started!: () => void;
const extracting = new Promise<void>(resolve => { started = resolve; });
const gate = new Promise<void>(resolve => { releaseText = resolve; });
let reads = 0;
const slow = {numPages:80,getPage:async()=>({getTextContent:async()=>{
  reads++; started(); await gate; return {items:[{str:'cancel needle'}]};
}})} as unknown as PDFDocumentProxy;
const cancel = usePdfSearch(shallowRef(slow));
const old = cancel.run('needle');
await extracting;
cancel.clear(); releaseText(); await old;
assert.equal(reads,1,'clear must stop scanning additional pages');
assert.equal(cancel.searching.value,false);
assert.deepEqual(cancel.hits.value,[],'cancelled search cannot refill results');
await cancel.run('cancel');
assert.equal(cancel.hits.value.length,80,'new query must remain usable after cancellation');
const stale = cancel.run('needle');
const fresh = cancel.run('missing');
await Promise.all([stale,fresh]);
assert.deepEqual(cancel.hits.value,[],'old query cannot overwrite replacement');
console.log('PASS PDF search cancellation: clear, restart and concurrent query replacement');
const mapping = usePdfSearch(shallowRef({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'  A  B'},{str:'İ test'}]})})} as unknown as PDFDocumentProxy));
await mapping.run('B');assert.equal(mapping.hits.value[0].charOffset,5,'whitespace offsets must match text spans');
await mapping.run('İ');assert.equal(mapping.hits.value[0].charOffset,7);assert.equal(mapping.hits.value[0].length,1,'Unicode folding must map back to source length');
console.log('PASS PDF exact source whitespace and Unicode search offsets');

const mixed=usePdfSearch(shallowRef({numPages:6,getPage:async(n:number)=>({getTextContent:async()=>({items:n===6?[{str:'needle'}]:[]})})} as unknown as PDFDocumentProxy));
await mixed.run('needle');assert.equal(mixed.hits.value.length,1);assert.equal(mixed.notice.value,'','first five empty pages must not classify a mixed document as a scan');
const {pageTextContent}=await import('../core/textCache');let adaptiveReads=0;
const adaptive={numPages:500,getPage:async()=>({getTextContent:async()=>{adaptiveReads++;return {items:[{str:'cached'}]};}})} as unknown as PDFDocumentProxy;
for(let n=1;n<=70;n++)await pageTextContent(adaptive,n);await pageTextContent(adaptive,1);
assert.equal(adaptiveReads,70,'adaptive cache retains more than the previous fixed 32 pages');
console.log('PASS PDF adaptive extraction reuse and mixed scanned/text search classification');

let closed=0;
const failing=usePdfSearch(shallowRef({numPages:4} as PDFDocumentProxy),async()=>({
  async text(page){if(page===3)throw Error('搜索读取预算测试');return 'needle needle';},
  async close(){closed++;},
}));
await failing.run('needle');
assert.equal(failing.hits.value.length,4,'failure must flush unpublished hits');
assert.ok(failing.error.value.includes('已保留 4 处结果')&&failing.error.value.includes('搜索读取预算测试'));
assert.equal(failing.searching.value,false);assert.equal(closed,1);
failing.next();assert.equal(failing.active.value,1);failing.prev();assert.equal(failing.active.value,0);
assert.ok(failing.hits.value.every(hit=>hit.page<3));
console.log('PASS PDF partial search retains all matches and navigation and closes its isolated reader');
