import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import type { Suite } from "../../../../tests/context";
import { checkContinuous } from "../../../../tests/continuous";
const suite: Suite = async (c) => {
  const markerName='audit-distinct-slides.pptx';
  if(!existsSync(c.fixture(markerName))){
    const zip=await JSZip.loadAsync(readFileSync(c.fixture('presentation.pptx')));
    for(const name of Object.keys(zip.files)){
      const match=name.match(/^ppt\/slides\/slide(\d+)\.xml$/);if(!match)continue;
      const source=await zip.file(name)!.async('string');zip.file(name,source.replace(/<a:t>[^<]*<\/a:t>/g,'<a:t>AUDIT-SLIDE-'+match[1]+'</a:t>'),{date:new Date('2026-01-01T00:00:00Z')});
    }
    writeFileSync(c.fixture(markerName),await zip.generateAsync({type:'nodebuffer'}));
  }
  const markers=await c.open(markerName);
  await c.evaluate(markers,"(()=>{const z=document.querySelector('.zoom-control input');z.value='25';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await c.pause(600);
  const wrong=await c.evaluate(markers,"[...document.querySelector('.slide-host').shadowRoot.querySelectorAll('.slide-page')].filter(page=>page.firstElementChild&&page.textContent.includes('AUDIT-SLIDE-')&&!page.textContent.includes('AUDIT-SLIDE-'+(Number(page.dataset.page)+1))).map(page=>({page:page.dataset.page,text:page.textContent.slice(0,160)}))");
  assert.deepEqual(wrong,[],'concurrent lazy renders must not snapshot another slide');
  const total=await c.evaluate<number>(markers,"Number(document.querySelector('.page-nav input').max)");
  await c.evaluate(markers,`(()=>{const p=document.querySelector('.page-nav input');for(const n of [${total},2]){p.value=String(n);p.dispatchEvent(new Event('change',{bubbles:true}))}})()`);
  await c.check(markers,'latest rapid PPT page request wins',"document.querySelector('.page-nav input').value==='2'");await c.pause(500);assert.equal(await c.evaluate(markers,"document.querySelector('.page-nav input').value"),'2','late older jump cannot overwrite newer navigation');c.close(markers);
  for (const name of ["presentation.pptx", "legacy.ppt"]) {
    const win = await c.open(name);
    await c.check(
      win,
      "PPT pages coexist " + name,
      "document.querySelector('.slide-host').shadowRoot.querySelectorAll('.slide-page').length>=2",
    );
    await c.check(
      win,
      "PPT content survives " + name,
      "document.querySelector('.slide-host').shadowRoot.textContent.length>150",
    );
    // 第 1 页应为已渲染内容（不再是空占位）
    await c.check(
      win,
      "PPT first slide rendered immediately " + name,
      "!document.querySelector('.slide-host').shadowRoot.querySelector('.slide-page:first-of-type').classList.contains('slide-placeholder')",
    );
    // 总页数应全部创建（含占位）- input[max] 是总页数，Shadow DOM 节点数应相等
    await c.check(
      win,
      "PPT all page nodes created " + name,
      "(()=>{const inp=document.querySelector('.page-nav input[type=number]');const total=inp?Number(inp.max):0;const nodes=document.querySelector('.slide-host').shadowRoot.querySelectorAll('.slide-page').length;return total>0&&nodes===total;})()",
    );
    await checkContinuous(c, win, ".slide-scroll");
    await c.snapshot(win, name === "legacy.ppt" ? "ppt-legacy" : "pptx");
    c.close(win);
  }
};
export default suite;
