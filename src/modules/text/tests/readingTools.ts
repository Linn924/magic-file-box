import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';
const suite:Suite=async c=>{
  const name='text-reading-tools-v1.js';
  const source=Array.from({length:180},(_,block)=>[`function block${block}() {`,...Array.from({length:30},(_,i)=>`  const row${i} = "${block===150&&i===15?'hidden-search-target':'normal'}";`),'}'].join('\n')).join('\n');
  if(!existsSync(c.fixture(name)))writeFileSync(c.fixture(name),source);
  const before=readFileSync(c.fixture(name)),win=await c.open(name);
  const setInput=async(selector:string,value:string)=>c.evaluate(win,`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const visible=(line:number)=>`(()=>{const root=document.querySelector('.text-scroll'),row=root.querySelector('.text-line[data-line="${line}"]');if(!row)return false;const r=row.getBoundingClientRect(),v=root.getBoundingClientRect();return r.bottom>v.top&&r.top<v.bottom})()`;
  try{
    await c.check(win,'syntax-aware fold controls are available',"!!document.querySelector('.text-fold-toggle')");
    await c.click(win,'.text-fold-all');
    await c.check(win,'folding hides source lines while retaining their original numbers',"document.querySelectorAll('.text-line').length===180&&document.querySelector('.text-line[data-line="+'"2"'+"]')===null&&document.querySelector('.text-fold-summary')");
    await c.click(win,'.text-go-toggle');await setInput('[aria-label=跳转行号]','4817');await c.evaluate(win,"document.querySelector('.text-go-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await c.check(win,'line jump opens its folded block and reveals the exact line',visible(4817));
    await c.check(win,'jumped source line is highlighted without changing its text',"document.querySelector('.text-jump-target').dataset.line==='4817'&&document.querySelector('.text-jump-target .line-body').textContent.includes('hidden-search-target')");
    await c.click(win,'.text-fold-all');await c.click(win,'.text-search-toggle');await setInput('.text-search-input','hidden-search-target');
    await c.check(win,'search includes hidden lines and expands the selected result',"document.querySelector('.text-search-count').textContent.includes('1 / 1')&&document.querySelector('.text-current-hit')?.textContent==='hidden-search-target'");
    await c.check(win,'fold-aware search result is visible',visible(4817));
    await setInput('.text-search-input','normal');await setInput('.text-search-input','hidden-search-target');
    await c.check(win,'a newer query cancels the preceding search',"document.querySelector('.text-search-count').textContent.includes('1 / 1')&&document.querySelector('.text-current-hit')?.textContent==='hidden-search-target'");
    await c.click(win,'.text-unfold-all');await c.click(win,'.text-go-toggle');await setInput('[aria-label=跳转行号]','0');await c.evaluate(win,"document.querySelector('.text-go-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await c.check(win,'invalid line numbers retain the current document and show an error',"document.querySelector('.text-go-form [role=alert]')?.textContent.includes('1–')");
    await setInput('[aria-label=跳转行号]','5700');await c.evaluate(win,"document.querySelector('.text-go-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await c.check(win,'distant line jump mounts a bounded virtual window',visible(5700)+"&&document.querySelectorAll('.text-line').length<100");
    c.program.updateSettings({theme:'dark'});win.unmaximize();win.setSize(720,650);await c.snapshot(win,'text-jump-fold-search');
    assert.deepEqual(readFileSync(c.fixture(name)),before);c.pass('text tools preserve source bytes');
  }finally{c.program.updateSettings({theme:'light'});c.close(win);}
  const repeated='text-repeated-search-v1.txt';if(!existsSync(c.fixture(repeated)))writeFileSync(c.fixture(repeated),'a'.repeat(20000));
  const repeat=await c.open(repeated);
  try{
    await c.click(repeat,'.text-search-toggle');
    await c.evaluate(repeat,"(()=>{window.searchGap=0;let last=performance.now();window.searchTimer=setInterval(()=>{const now=performance.now();window.searchGap=Math.max(window.searchGap,now-last);last=now;},10);const input=document.querySelector('.text-search-input');input.value='a';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await c.check(repeat,'repeated text search keeps full counts with bounded highlight nodes',"document.querySelector('.text-search-count').textContent.includes('1 / 20000')&&document.querySelectorAll('.text-hit').length<=513");
    await c.click(repeat,'.text-find-previous');
    await c.check(repeat,'last repeated occurrence remains navigable beyond the highlight budget',"document.querySelector('.text-search-count').textContent.includes('20000 / 20000')&&document.querySelector('.text-current-hit')?.dataset.hitStart==='19999'");
    const gap=await c.evaluate<number>(repeat,"window.searchGap");assert.ok(gap<600,'repeated-search fixture keeps the renderer responsive');c.pass('repeated-search fixture timer gap '+Math.round(gap)+' ms');
  }finally{await c.evaluate(repeat,"clearInterval(window.searchTimer)");c.close(repeat);}
  const markdown='text-fold-fences-v1.md',fenced=['# Main','','````md','```js','# This is code, not a section','```','````','','## Next','body'].join('\n');
  if(!existsSync(c.fixture(markdown)))writeFileSync(c.fixture(markdown),fenced);
  const original=readFileSync(c.fixture(markdown)),md=await c.open(markdown);
  try{
    await c.click(md,'.md-source-toggle');
    await c.check(md,'outer Markdown fence has a fold control',"!!document.querySelector('.text-line[data-line=\"3\"] .text-fold-toggle')");
    await c.check(md,'code-example headings do not become Markdown section folds',"!document.querySelector('.text-line[data-line=\"5\"] .text-fold-toggle')");
    await c.click(md,'.text-line[data-line="3"] .text-fold-toggle');
    await c.check(md,'folding an outer Markdown fence hides the whole nested example',"!document.querySelector('.text-line[data-line=\"5\"]')&&!document.querySelector('.text-line[data-line=\"7\"]')&&!!document.querySelector('.text-line[data-line=\"9\"]')");
    await c.snapshot(md,'text-markdown-fence-fold');
    await c.click(md,'.text-line[data-line="3"] .text-fold-toggle');
    assert.equal(await c.evaluate(md,"[...document.querySelectorAll('.line-body')].map(el=>el.textContent).join('\\n')"),fenced);
    assert.deepEqual(readFileSync(c.fixture(markdown)),original);c.pass('Markdown nested-fence folding restores exact source characters');
  }finally{c.close(md);}
};
export default suite;
