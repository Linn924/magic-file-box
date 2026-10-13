import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';
const suite:Suite=async c=>{
  const name='md-optimization.md';if(!existsSync(c.fixture(name)))writeFileSync(c.fixture(name),['# 资源优化','![near](image.png)','needle **marker** one','needle marker two','```mermaid\nflowchart LR\n A[Start] --> B[End]\n```',...Array.from({length:300},()=> 'Padding paragraph'), '![far](image.png)',...Array.from({length:3000},(_,i)=>'## Section '+i+'\n\nSection body '+i)].join('\n\n'));
  const before=readFileSync(c.fixture(name)),win=await c.open(name),theme=c.program.settings.get().theme;
  try{
    await c.check(win,'near Markdown image is loaded before distant images',"document.querySelector('img[alt=near]')?.naturalWidth>0&&!document.querySelector('img[alt=far]').getAttribute('src')");
    await c.check(win,'optimization chart ready',"!!document.querySelector('.md-diagram')?.shadowRoot?.querySelector('svg')");
    await c.click(win,'.text-search-toggle');await c.evaluate(win,"(()=>{const i=document.querySelector('.text-search-input');i.value='needle marker';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await c.check(win,'rendered query has two matches',"document.querySelector('.text-search-count').textContent.includes('1 / 2')");await c.click(win,'.md-find-next');
    await c.evaluate(win,"document.querySelector('.text-scroll').scrollTop=1200");const top=await c.evaluate<number>(win,"document.querySelector('.text-scroll').scrollTop");await c.evaluate(c.home,`window.localPreview.setSettings({theme:${JSON.stringify(theme==='dark'?'light':'dark')}})`);await c.pause(1200);
    await c.check(win,'theme and asynchronous diagrams preserve the selected search match',"document.querySelector('.text-search-count').textContent.includes('2 / 2')&&document.querySelectorAll('.md-current-hit').length===1");assert.ok(Math.abs(await c.evaluate<number>(win,"document.querySelector('.text-scroll').scrollTop")-top)<3,'theme chart repaint must retain reading position');
    await c.evaluate(win,"document.querySelector('img[alt=far]').scrollIntoView({block:'center'})");await c.check(win,'distant image loads only after reading reaches it',"document.querySelector('img[alt=far]').naturalWidth>0");
    await c.click(win,'.md-outline-toggle');await c.check(win,'long Markdown outline renders a bounded set of buttons',"document.querySelectorAll('.md-outline button').length<80");await c.evaluate(win,"document.querySelector('.md-outline').scrollTop=document.querySelector('.md-outline').scrollHeight");await c.check(win,'virtual outline makes its last heading reachable',"[...document.querySelectorAll('.md-outline button')].some(b=>b.textContent==='Section 2999')");await c.click(win,'.md-outline button','Section 2999');await c.check(win,'virtual heading click reaches the real document chapter',"document.querySelector('.text-scroll').scrollTop>100000&&document.querySelectorAll('.md-outline button').length<80");
    await c.snapshot(win,'markdown-optimized-outline');assert.deepEqual(readFileSync(c.fixture(name)),before);c.pass('Markdown lazy image, stable search/reading and bounded outline');
  }finally{c.close(win);await c.evaluate(c.home,`window.localPreview.setSettings({theme:${JSON.stringify(theme)}})`);}
};
export default suite;
