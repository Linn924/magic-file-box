import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import type {Suite,TestContext} from '../../../../tests/context';
import {outlineFixture} from './outlineFixture';

const suite:Suite=async c=>{
  const name='outline-layout-v1.pdf',file=c.fixture(name);
  const titles=Array.from({length:30},(_,i)=>i===0?'Long heading '+ 'unbroken-title-'.repeat(16):i===29?'末章：'+ '完整目录标题与悬停文字'.repeat(12):`章节 ${i}`);
  if(!existsSync(file))outlineFixture(file,titles);
  const digest=()=>createHash('sha256').update(readFileSync(file)).digest('hex'),original=digest();
  const win=await c.open(name),zoom=win.webContents.getZoomFactor();
  try{
    win.webContents.debugger.attach('1.3');
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
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
        await c.check(win,'pointer leaves the previous directory entry before hovering',"!document.querySelector('.outline-item').matches(':hover')");
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
        await c.check(win,'hovered directory entry exposes its full original heading',`document.querySelector('.outline-item').matches(':hover')&&document.querySelector('.outline-item').title===${JSON.stringify(titles[0])}`).catch(async error=>{
          console.log('Outline hover',JSON.stringify(await c.evaluate(win,`({point:${JSON.stringify(point)},hovered:[...document.querySelectorAll(':hover')].map(el=>el.className),focused:document.hasFocus()})`)));
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
  }finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();win.webContents.setZoomFactor(zoom);c.close(win);c.program.updateSettings({theme:'light'});}
  await treeOutline(c);
};

async function treeOutline(c:TestContext){
  const file=c.fixture('outline-tree-layout-v1.pdf');
  const titles=Array.from({length:30},(_,i)=>i===0?'第1章 含多级目录的章节':i===1?'1.1 同级普通标题':i===2?'1.2 带下级标题的章节':i===3?'1.2.1 默认折叠的子目录':i===4?'1.2.1.1 更深一层标题':i===29?'第2章 同级无子目录的章节':`1.${i-2} 目录标题与层级对齐检查`);
  const parents=Array.from({length:30},(_,i)=>i===0||i===29?null:i===3?2:i===4?3:0);
  if(!existsSync(file))outlineFixture(file,titles,parents);
  const digest=()=>createHash('sha256').update(readFileSync(file)).digest('hex'),original=digest();
  const win=await c.open('outline-tree-layout-v1.pdf'),zoom=win.webContents.getZoomFactor();
  const aligned=`(()=>{const levels=new Map();return [...document.querySelectorAll('.outline-row')].every(row=>{const left=row.querySelector('.outline-title').getBoundingClientRect().left,depth=row.style.paddingLeft,slot=row.querySelector('.outline-toggle,.outline-toggle-spacer'),width=slot.getBoundingClientRect().width;if(Math.abs(width-18)>.1)return false;if(levels.has(depth))return Math.abs(left-levels.get(depth))<.1;levels.set(depth,left);return true;})})()`;
  const fixed=`(()=>{const filter=document.querySelector('.outline-filter'),box=filter.getBoundingClientRect(),list=document.querySelector('.pdf-outline'),view=list.getBoundingClientRect(),panel=document.querySelector('.pdf-outline-panel').getBoundingClientRect(),point=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return Math.abs(box.top-panel.top)<1&&Math.round(view.top*1000)>=Math.round(box.bottom*1000)&&view.bottom<=panel.bottom+1&&!!point?.closest('.outline-filter')&&getComputedStyle(list).overflowY==='auto';})()`;
  try{
    win.webContents.debugger.attach('1.3');
    await c.click(win,'.pdf-nav-toggle');
    await c.check(win,'nested directory includes both branches and leaves',"document.querySelectorAll('.outline-row').length===29&&document.querySelectorAll('.outline-toggle').length===3");
    for(const theme of ['light','dark'] as const){
      c.program.updateSettings({theme});win.unmaximize();win.setSize(theme==='light'?1000:720,700);win.webContents.setZoomFactor(theme==='light'?1:1.25);
      for(const width of [168,320]){
        await c.evaluate(win,`(()=>{const handle=document.querySelector('.pdf-nav-resizer');for(let i=0;i<12;i++)handle.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(width===168?'ArrowLeft':'ArrowRight')},bubbles:true,cancelable:true}));document.querySelector('.pdf-outline').scrollTop=0;})()`);
        await c.check(win,`branch and leaf headings align at each depth: ${theme}, ${width}`,aligned);
        await c.check(win,'tree arrows have no button border and use the reserved column',"[...document.querySelectorAll('.outline-toggle')].every(button=>getComputedStyle(button).borderTopWidth==='0px'&&button.querySelector('svg').getAttribute('fill')==='currentColor'&&button.getBoundingClientRect().width===18)");
        if(width===320)await c.snapshot(win,`pdf-outline-tree-top-${theme}`);
        const before=await c.evaluate<number>(win,"document.querySelector('.outline-filter').getBoundingClientRect().top");
        const point=await c.evaluate<{x:number;y:number}>(win,"(()=>{const r=document.querySelector('.pdf-outline').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaY:280,deltaX:0});
        await c.check(win,'native directory wheel scrolls only the entries',"document.querySelector('.pdf-outline').scrollTop>50");
        await c.check(win,'search stays fixed and cannot be covered by scrolled headings',`${fixed}&&Math.abs(document.querySelector('.outline-filter').getBoundingClientRect().top-${before})<1`).catch(async error=>{
          console.log('Directory scroll',JSON.stringify(await c.evaluate(win,`(()=>{const filter=document.querySelector('.outline-filter'),box=filter.getBoundingClientRect(),list=document.querySelector('.pdf-outline'),panel=document.querySelector('.pdf-outline-panel');return {before:${before},filter:box.toJSON(),list:list.getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON(),panelScroll:panel.scrollTop,listScroll:list.scrollTop,hit:document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)?.outerHTML,overflow:getComputedStyle(list).overflowY}})()`)));
          await c.snapshot(win,'pdf-outline-search-scroll-failure');throw error;
        });
        if(width===320)await c.snapshot(win,`pdf-outline-tree-scrolled-${theme}`);
      }
    }
    await c.evaluate(win,"document.querySelector('.pdf-outline').scrollTop=0");
    await c.click(win,'[data-outline-key="r.0"] .outline-toggle');
    await c.check(win,'right-pointing collapsed arrow hides descendants without navigating',"document.querySelectorAll('.outline-row').length===2&&document.querySelector('.outline-toggle').getAttribute('aria-expanded')==='false'&&document.querySelector('.outline-toggle path').getAttribute('d')==='M5 3l6 5-6 5Z'&&document.querySelector('.page-nav input').value==='1'");
    await c.check(win,'root leaf remains aligned with its collapsed sibling',aligned);
    await c.click(win,'[data-outline-key="r.0"] .outline-toggle');
    await c.check(win,'down-pointing expanded arrow restores descendants',"document.querySelectorAll('.outline-row').length===29&&document.querySelector('.outline-toggle').getAttribute('aria-expanded')==='true'&&document.querySelector('.outline-toggle path').getAttribute('d')==='M3 5l5 6 5-6Z'");
    await c.click(win,'[data-outline-key="r.0.1.0"] .outline-toggle');
    await c.check(win,'nested expansion reveals the deeper heading with stable alignment',`document.querySelectorAll('.outline-row').length===30&&${aligned}`);
    await c.evaluate(win,"(()=>{const input=document.querySelector('[aria-label=搜索目录]');input.value='更深';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await c.check(win,'directory search shows ancestors as expanded while keeping search fixed',`document.querySelectorAll('.outline-row').length===4&&[...document.querySelectorAll('.outline-toggle')].every(button=>button.disabled&&button.getAttribute('aria-expanded')==='true')&&${fixed}`);
    await c.click(win,'[aria-label=清除目录搜索]');
    await c.click(win,'[data-outline-key="r.1"] .outline-item');
    await c.check(win,'automatic chapter reveal scrolls below the fixed search bar',`document.querySelector('.page-nav input').value==='3'&&document.querySelector('.pdf-outline').scrollTop>0&&${fixed}&&(()=>{const row=document.querySelector('[data-outline-key="r.1"]').getBoundingClientRect(),view=document.querySelector('.pdf-outline').getBoundingClientRect();return row.top>=view.top&&row.bottom<=view.bottom})()`);
    assert.equal(digest(),original);c.pass('nested directory source file remains unchanged (SHA256)');
  }finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();win.webContents.setZoomFactor(zoom);c.close(win);c.program.updateSettings({theme:'light'});}
}
export default suite;
