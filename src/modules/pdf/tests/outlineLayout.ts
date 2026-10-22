import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';
import {outlineFixture} from './outlineFixture';

const suite:Suite=async c=>{
  const name='outline-layout-v1.pdf',file=c.fixture(name);
  const titles=Array.from({length:30},(_,i)=>i===0?'Long heading '+ 'unbroken-title-'.repeat(16):i===29?'末章：'+ '完整目录标题与悬停文字'.repeat(12):`章节 ${i}`);
  if(!existsSync(file))outlineFixture(file,titles);
  const digest=()=>createHash('sha256').update(readFileSync(file)).digest('hex'),original=digest();
  const win=await c.open(name),zoom=win.webContents.getZoomFactor();
  try{
    win.unmaximize();win.setSize(1000,700);
    await c.click(win,'.pdf-nav-toggle');
    await c.check(win,'PDF directory loads all original heading titles',"document.querySelectorAll('.outline-title').length===30");
    assert.deepEqual(await c.evaluate(win,"[...document.querySelectorAll('.outline-title')].map(el=>el.textContent)"),titles);
    const layout=`(()=>{const host=document.querySelector('.pdf-outline'),buttons=[...host.querySelectorAll('.outline-item')];return buttons.length>0&&host.scrollWidth<=host.clientWidth+1&&buttons.every(button=>{const title=button.querySelector('.outline-title'),page=button.querySelector('.outline-page'),style=getComputedStyle(title),rect=button.getBoundingClientRect(),text=title.getBoundingClientRect(),number=page.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(title);return button.title===title.textContent&&style.whiteSpace==='nowrap'&&style.overflow==='hidden'&&style.textOverflow==='ellipsis'&&[...range.getClientRects()].every(line=>Math.abs(line.top-range.getClientRects()[0].top)<1)&&Math.abs(rect.height-28)<1&&text.right<=number.left&&number.right<=rect.right;})})()`;
    for(const theme of ['light','dark'] as const){
      c.program.updateSettings({theme});
      win.setSize(theme==='light'?1000:720,700);
      win.webContents.setZoomFactor(theme==='light'?1:1.25);
      for(const width of [168,320]){
        await c.evaluate(win,`(()=>{const handle=document.querySelector('.pdf-nav-resizer');for(let i=0;i<12;i++)handle.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(width===168?'ArrowLeft':'ArrowRight')},bubbles:true,cancelable:true}));return true})()`);
        await c.check(win,`PDF directory stays one line with page numbers: ${theme}, sidebar ${width}`,`parseFloat(document.querySelector('.pdf-nav').style.width)===${width}&&${layout}`).catch(async error=>{
          console.log('Outline layout',await c.evaluate(win,"(()=>{const host=document.querySelector('.pdf-outline');return {widths:[host.clientWidth,host.scrollWidth],items:[...host.querySelectorAll('.outline-item')].slice(0,3).map(button=>{const title=button.querySelector('.outline-title'),page=button.querySelector('.outline-page'),range=document.createRange();range.selectNodeContents(title);return {height:button.getBoundingClientRect().height,titleRect:title.getBoundingClientRect().toJSON(),pageRect:page.getBoundingClientRect().toJSON(),buttonRect:button.getBoundingClientRect().toJSON(),lines:range.getClientRects().length,style:[getComputedStyle(title).whiteSpace,getComputedStyle(title).textOverflow,getComputedStyle(title).overflow]}})}})()"));
          await c.snapshot(win,'pdf-outline-layout-failure');throw error;
        });
        await c.check(win,'long directory heading overflows within its ellipsis box',"(()=>{const title=document.querySelector('.outline-title');return title.scrollWidth>title.clientWidth})()");
        const point=await c.evaluate<{x:number;y:number}>(win,"(()=>{const r=document.querySelector('.outline-title').getBoundingClientRect();return {x:r.left+Math.min(10,r.width/2),y:r.top+r.height/2}})()");
        const factor=win.webContents.getZoomFactor();
        win.webContents.sendInputEvent({type:'mouseMove',x:0,y:0});
        await c.check(win,'pointer leaves the previous directory entry before hovering',"!document.querySelector('.outline-item').matches(':hover')");
        win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(point.x*factor),y:Math.round(point.y*factor)});
        await c.check(win,'hovered directory entry exposes its full original heading',`document.querySelector('.outline-item').matches(':hover')&&document.querySelector('.outline-item').title===${JSON.stringify(titles[0])}`).catch(async error=>{
          console.log('Outline hover',JSON.stringify(await c.evaluate(win,`({point:${JSON.stringify(point)},factor:${factor},hovered:[...document.querySelectorAll(':hover')].map(el=>el.className),focused:document.hasFocus()})`)));
          await c.snapshot(win,'pdf-outline-hover-failure');throw error;
        });
        if(width===168)await c.snapshot(win,`pdf-outline-single-line-${theme}`);
      }
    }
    await c.evaluate(win,"(()=>{const input=document.querySelector('[aria-label=搜索目录]');input.value='末章';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await c.check(win,'directory filter preserves full Chinese heading and ellipsis',`document.querySelectorAll('.outline-item').length===1&&document.querySelector('.outline-item').title===${JSON.stringify(titles[29])}&&${layout}`);
    await c.click(win,'.outline-item');
    await c.check(win,'truncated directory title still navigates to its destination',"document.querySelector('.page-nav input').value==='3'&&document.querySelector('.outline-item').classList.contains('current')");
    await c.click(win,'[aria-label=清除目录搜索]');
    await c.check(win,'clearing directory filter restores all single-line entries',`document.querySelectorAll('.outline-item').length===30&&${layout}`);
    assert.equal(digest(),original);c.pass('directory source file remains unchanged (SHA256)');
  }finally{win.webContents.setZoomFactor(zoom);c.close(win);c.program.updateSettings({theme:'light'});}
};
export default suite;
