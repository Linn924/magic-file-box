import assert from 'node:assert/strict';
import {defaultCodeAppearance} from '../../../../shared/codeAppearance';
import type {Suite} from '../../../../tests/context';
const suite:Suite=async c=>{
  const win=c.home,settings=c.program.settings.get(),zoom=win.webContents.getZoomFactor(),bounds=win.getBounds(),maximized=win.isMaximized();
  const footerVisible="[...document.querySelectorAll('.code-appearance-dialog footer button,.appearance-close')].every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})";
  try{
    c.program.updateSettings({theme:'light',codeAppearance:defaultCodeAppearance()});win.unmaximize();await c.pause(120);
    for(const [width,height,factor] of [[1100,560,1],[720,560,1],[1100,560,1.25],[720,560,1.25]] as const){
      c.program.updateSettings({theme:factor>1?'dark':'light',codeAppearance:defaultCodeAppearance()});
      win.webContents.setZoomFactor(factor);win.setSize(width,height);await c.pause(180);
      if(!await c.evaluate(win,"!!document.querySelector('.settings-panel')"))await c.click(win,'.settings-button');await c.check(win,'appearance entry ready',"!!document.querySelector('.appearance-open')");await c.click(win,'.appearance-open');await c.check(win,'appearance layout dialog ready',"!!document.querySelector('.code-appearance-dialog .syntax-token')");
      await c.evaluate(win,"(()=>{const t=document.querySelector('[aria-label=\"自定义代码 CSS\"]');t.value='/* '+Array.from({length:80},(_,i)=>'CSS line '+i).join('\\n')+' */\\n.comment { color: #667085; }';t.dispatchEvent(new Event('input',{bubbles:true}));t.style.height='300px';})()");
      const name=width+'x'+height+'-'+factor;
      await c.snapshot(win,'appearance-scroll-'+name);
      await c.check(win,'appearance body has bounded vertical scrolling '+name,"(()=>{const d=document.querySelector('.code-appearance-dialog'),b=d.querySelector('.appearance-body'),r=d.getBoundingClientRect(),f=d.querySelector('footer').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1&&b.scrollHeight>b.clientHeight+4&&b.getBoundingClientRect().bottom<=f.top+1})()");
      await c.check(win,'appearance footer is visible and hit-tests '+name,footerVisible);
      await c.evaluate(win,"document.querySelector('.appearance-body').scrollTop=document.querySelector('.appearance-body').scrollHeight");
      await c.check(win,'CSS editor can be reached through body scrolling '+name,"(()=>{const b=document.querySelector('.appearance-body'),t=b.querySelector('textarea'),r=t.getBoundingClientRect(),q=b.getBoundingClientRect();return b.scrollTop>0&&r.bottom>q.top&&r.top<q.bottom&&r.right<=q.right+1})()");
      await c.check(win,'scrolled CSS editor has an unobstructed editing area '+name,"(()=>{const b=document.querySelector('.appearance-body').getBoundingClientRect(),t=document.querySelector('textarea'),r=t.getBoundingClientRect(),lo=Math.max(b.top,r.top),hi=Math.min(b.bottom,r.bottom);return hi-lo>8&&t.contains(document.elementFromPoint(r.left+r.width/2,hi-4))})()");
      await c.snapshot(win,'appearance-css-scroll-'+name);
      await c.evaluate(win,"(()=>{const t=document.querySelector('textarea');t.scrollTop=t.scrollHeight})()");assert.ok(await c.evaluate<number>(win,"document.querySelector('textarea').scrollTop")>0);
      assert.equal(await c.evaluate(win,"(()=>{document.querySelector('.appearance-save').click();return Promise.resolve().then(()=>document.querySelector('[aria-label=\"代码字体\"]').matches(':disabled')&&document.querySelector('textarea').matches(':disabled')&&document.querySelector('#appearance-color-keyword').matches(':disabled'))})()"),true);
      await c.check(win,'layout retains save locking and completion '+name,"document.querySelector('.appearance-status').textContent.includes('已应用并保存')");
      await c.evaluate(win,"document.querySelector('.code-appearance-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");await c.check(win,'layout Escape restores parent focus '+name,"!document.querySelector('.code-appearance-dialog')&&!document.querySelector('.settings-panel').inert&&document.activeElement.classList.contains('appearance-open')");
    }
    c.pass('appearance body/CSS scroll independently, footer stays reachable, and save/focus survive window and zoom changes');
  }finally{win.webContents.setZoomFactor(zoom);await c.evaluate(win,"document.querySelector('.appearance-close')?.click();document.querySelector('[aria-label=\"关闭设置\"]')?.click()");win.setBounds(bounds);if(maximized)win.maximize();c.program.updateSettings(settings);}
};
export default suite;
