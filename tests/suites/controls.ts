import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import type {BrowserWindow} from 'electron';
import type {Suite} from '../context';
import {updateTest} from '../updateDriver';

const suite:Suite=async c=>{
  const home=c.home,settings=c.program.settings.get(),bounds=home.getBounds(),zoom=home.webContents.getZoomFactor(),maximized=home.isMaximized();
  const windows:BrowserWindow[]=[];
  const settled="!document.querySelector('[class*=popup-tv-][class*=-active],[class*=notification-slide-][class*=-active]')";
  const alignment=`(() => {
    const failures=[],root=document.querySelector('.code-appearance-dialog,.excel-formula-dialog')||document.querySelector('.settings-panel')||document;
    for(const button of root.querySelectorAll('button')){
      const b=button.getBoundingClientRect();if(!b.width||!b.height||button.closest('[inert]'))continue;
      for(const svg of button.querySelectorAll(':scope > svg')){
        const s=svg.getBoundingClientRect();
        if(Math.abs(b.top+b.height/2-s.top-s.height/2)>.6)failures.push('icon-y '+button.outerHTML);
        if(!button.textContent.trim()&&Math.abs(b.left+b.width/2-s.left-s.width/2)>.6)failures.push('icon-x '+button.outerHTML);
      }
      const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;
      while(node=walker.nextNode()){
        const text=node.textContent.trim();if(!text||node.parentElement.closest('.sr-only'))continue;
        const range=document.createRange();range.setStart(node,node.textContent.indexOf(text));range.setEnd(node,node.textContent.indexOf(text)+text.length);
        const r=range.getBoundingClientRect();
        if(r.width&&Math.abs(b.top+b.height/2-r.top-r.height/2)>1)failures.push('text-y '+button.outerHTML);
      }
    }
    return failures;
  })()`;
  const freeze=(selector:string,time:number)=>`(() => {
    const root=document.querySelector(${JSON.stringify(selector)});if(!root)throw Error('Missing motion surface');
    const animations=root.getAnimations({subtree:true});if(!animations.length)throw Error('Missing running animation');
    window.__surfaceAnimations=animations;
    for(const animation of animations){animation.pause();animation.currentTime=${time};}
    return {count:animations.length,inert:root.inert,hidden:root.getAttribute('aria-hidden'),clip:getComputedStyle(root.querySelector('[role=dialog]')||root).clipPath,names:animations.map(a=>a.animationName||a.transitionProperty)};
  })()`;
  const capture=async(win:BrowserWindow,name:string)=>writeFileSync(path.resolve('outputs/verification',name+'.png'),(await win.webContents.capturePage()).toPNG());
  async function resume(win:BrowserWindow){await c.evaluate(win,"window.__surfaceAnimations?.forEach(animation=>animation.play());delete window.__surfaceAnimations");await c.check(win,'surface transition finishes and releases its DOM state',settled);}
  async function openSettings(){await c.click(home,'.settings-button');await c.check(home,'settings opening completes',settled);}
  try{
    home.unmaximize();
    for(const [width,factor,theme] of [[1100,1,'light'],[720,1.5,'dark']] as const){
      home.setSize(width,640);home.webContents.setZoomFactor(factor);c.program.updateSettings({theme,notificationDuration:'always'});await c.pause(180);
      await openSettings();
      assert.deepEqual(await c.evaluate(home,alignment),[],'settings buttons must center text and SVGs');
      await c.check(home,'customize text is centered horizontally',`(() => {const b=document.querySelector('.appearance-open'),r=b.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(b);const t=range.getBoundingClientRect();return Math.abs(r.left+r.width/2-t.left-t.width/2)<.6})()`);
      await c.check(home,'select has an editable surface and a centered arrow',"(()=>{const e=document.querySelector('#theme'),s=getComputedStyle(e);return s.backgroundColor!==getComputedStyle(document.querySelector('.settings-nav')).backgroundColor&&s.backgroundImage.includes('svg')&&s.backgroundPositionY==='50%'&&s.cursor==='pointer'&&parseFloat(s.paddingTop)===0&&parseFloat(s.paddingBottom)===0})()");
      await c.snapshot(home,'controls-settings-'+theme+'-'+factor);
      await c.click(home,'.appearance-open');await c.check(home,'nested appearance transition completes',settled);
      await c.check(home,'nested appearance controls are ready',"!!document.querySelector('.code-appearance-dialog .syntax-token')");
      assert.deepEqual(await c.evaluate(home,alignment),[],'appearance buttons must center text and SVGs');
      await c.check(home,'compact italic bold and underline buttons fit without overlapping reset',"[...document.querySelectorAll('.appearance-font-flags')].every(group=>{const bounds=group.getBoundingClientRect(),reset=group.parentElement.querySelector('.tool-button-wrap').getBoundingClientRect();return [...group.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return Math.abs(r.width-24)<.6&&r.left>=bounds.left-.6&&r.right<=bounds.right+.6&&r.right<=reset.left})})");
      await c.check(home,'editable field has symmetric vertical padding and accepts text',`(()=>{const input=document.querySelector('[aria-label="代码字体"]'),s=getComputedStyle(input);input.value='Consolas';input.dispatchEvent(new Event('input',{bubbles:true}));return !input.disabled&&s.cursor==='text'&&s.backgroundColor===getComputedStyle(document.querySelector('#theme')).backgroundColor&&parseFloat(s.paddingTop)===0&&parseFloat(s.paddingBottom)===0})()`);
      await c.check(home,'disabled fieldset uses a distinct surface and unavailable cursor',`(()=>{const field=document.querySelector('.appearance-fields'),input=document.querySelector('[aria-label="代码字体"]'),select=document.querySelector('[aria-label="使用配色预设"]'),before=getComputedStyle(input).backgroundColor;field.disabled=true;const disabled=getComputedStyle(input),drop=getComputedStyle(select);const ok=input.matches(':disabled')&&select.matches(':disabled')&&disabled.backgroundColor!==before&&disabled.cursor==='not-allowed'&&drop.cursor==='not-allowed'&&getComputedStyle(document.querySelector('#appearance-color-keyword')).cursor==='not-allowed'&&disabled.color!==getComputedStyle(document.body).color;field.disabled=false;return ok})()`);
      await c.snapshot(home,'controls-appearance-'+theme+'-'+factor);
      await c.click(home,'.appearance-close');await c.check(home,'nested close restores the original trigger',"!document.querySelector('.code-appearance-dialog')&&document.activeElement.classList.contains('appearance-open')&&!document.querySelector('.settings-panel').inert");
      await c.click(home,'[aria-label=关闭设置]');await c.check(home,'settings close removes its backdrop',"!document.querySelector('.modal-backdrop')");
    }
    home.setSize(1100,740);home.webContents.setZoomFactor(1);c.program.updateSettings({theme:'light'});
    await c.evaluate(home,"document.querySelector('.settings-button').click()");await c.pause(35);
    await c.evaluate(home,freeze('.modal-backdrop',60));
    await c.check(home,'opening expands from a narrow horizontal center line',"(()=>{const panel=document.querySelector('.settings-panel'),clip=getComputedStyle(panel).clipPath;return clip.startsWith('inset(calc(50% - 1px)')&&panel.getBoundingClientRect().height>400})()");
    await capture(home,'controls-popup-opening-line');await resume(home);
    await c.evaluate(home,"document.querySelector('[aria-label=关闭设置]').click()");await c.pause(30);await c.evaluate(home,freeze('.modal-backdrop',117));
    await c.check(home,'closing collapses to a line while disabling the leaving controls',"(()=>{const root=document.querySelector('.modal-backdrop');return root&&root.inert&&root.getAttribute('aria-hidden')==='true'&&getComputedStyle(root.querySelector('.settings-panel')).clipPath.startsWith('inset(calc(50% - 1px)')})()");
    await capture(home,'controls-popup-closing-line');await resume(home);
    await c.check(home,'finished close leaves no invisible backdrop',"!document.querySelector('.modal-backdrop')");
    await c.evaluate(home,`(async()=>{const frame=()=>new Promise(requestAnimationFrame);document.querySelector('.settings-button').click();await frame();await frame();document.querySelector('[aria-label=关闭设置]').click();await frame();document.querySelector('.settings-button').click()})()`);
    await c.check(home,'rapid reopen leaves exactly one interactive settings surface',"document.querySelectorAll('.settings-panel').length===1&&!document.querySelector('.modal-backdrop').inert&&getComputedStyle(document.querySelector('.settings-panel')).clipPath==='none'");
    await c.click(home,'[aria-label=关闭设置]');await c.check(home,'rapid reopen can still close normally',"!document.querySelector('.modal-backdrop')");

    const excel=await c.open('styled.xlsx');windows.push(excel);await c.click(excel,'.excel-edit-toggle');
    await c.click(excel,'.excel-formula-label');await c.check(excel,'formula dialog uses the shared opening animation',settled);
    await c.check(excel,'formula dialog fields are editable',"!!document.querySelector('.excel-formula-dialog input')&&!document.querySelector('.excel-formula-dialog input').disabled");
    assert.deepEqual(await c.evaluate(excel,alignment),[],'Excel buttons must center text and SVGs');
    await c.click(excel,'.excel-formula-dialog footer button');await c.check(excel,'formula dialog closes without leaving an overlay',"!document.querySelector('.excel-insert-overlay')");
    for(const [trigger,dialog,cancel] of [
      ['.excel-layout-toggle','.excel-grid-dialog','.excel-dialog-actions button[type=button]'],
      ['.excel-format-toggle','.excel-format-dialog','.excel-format-dialog footer button[type=button]'],
      ['.excel-sheets-toggle','.excel-sheet-dialog','.excel-sheet-dialog [data-cancel]'],
      ['.excel-sort-toggle','.excel-data-dialog','.excel-data-dialog [data-cancel]'],
    ]){
      await c.click(excel,trigger);await c.check(excel,'Excel editor surface opens '+trigger,`!!document.querySelector('${dialog}')&&${settled}`);
      assert.deepEqual(await c.evaluate(excel,alignment),[],'Excel dialog and toolbar contents must stay centered: '+trigger);
      await c.check(excel,'Excel dialog fields keep symmetric single-line padding '+trigger,`[...document.querySelectorAll('${dialog} input:not([type=checkbox]):not([type=color]),${dialog} select')].every(e=>parseFloat(getComputedStyle(e).paddingTop)===0&&parseFloat(getComputedStyle(e).paddingBottom)===0)`);
      await c.click(excel,cancel);await c.check(excel,'Excel editor surface closes without a leftover overlay '+trigger,`!document.querySelector('${dialog}')`);
    }
    await c.click(excel,'.excel-insert-toggle');assert.deepEqual(await c.evaluate(excel,alignment),[],'menu icon and label rows must align vertically');await c.click(excel,'.excel-custom-insert');
    await c.check(excel,'custom insert dialog animates and keeps its number input editable',`${settled}&&!!document.querySelector('.excel-insert-count')&&!document.querySelector('.excel-insert-count').disabled`);
    await c.click(excel,'.excel-insert-dialog button[type=button]');await c.check(excel,'custom insert closes without changing the workbook',"!document.querySelector('.excel-insert-overlay')&&document.querySelector('.excel-dirty').textContent==='编辑副本'");

    const notice=await c.open('invalid.json');windows.push(notice);await c.check(notice,'initial preview notice settles',settled);
    await c.evaluate(notice,'window.localPreview.updateAction("check")');notice.webContents.send('updates:notice');
    await c.check(notice,'two cards settle without a horizontal scrollbar',"!!document.querySelector('.update-notice')&&!document.querySelector('.notification-slide-enter-active')&&(()=>{const e=document.querySelector('.notification-stack');return e.scrollWidth<=e.clientWidth})()");
    const previewTop=await c.evaluate<number>(notice,"document.querySelector('.preview-notice').getBoundingClientRect().top");
    await c.evaluate(notice,"document.querySelector('.update-dismiss').click()");await c.pause(30);
    await c.evaluate(notice,freeze('.update-notice',110));
    await c.check(notice,'notification slides right while its space contracts smoothly',`(()=>{const e=document.querySelector('.update-notice'),stack=document.querySelector('.notification-stack'),r=e.getBoundingClientRect(),a=document.querySelector('.preview-notice').getBoundingClientRect();return e.inert&&new DOMMatrixReadOnly(getComputedStyle(e).transform).m41>0&&r.right>stack.getBoundingClientRect().right&&a.top>${previewTop}&&parseFloat(getComputedStyle(e).opacity)<1})()`);
    await capture(notice,'controls-notification-closing-right');await resume(notice);
    await c.check(notice,'closing update leaves the preview notice usable',"!document.querySelector('.update-notice')&&!!document.querySelector('.preview-notice-dismiss')");
    notice.webContents.send('updates:notice');await c.pause(35);await c.evaluate(notice,freeze('.update-notice',110));
    await c.check(notice,'notification enters from the right toward its final position',"(()=>{const e=document.querySelector('.update-notice'),s=getComputedStyle(e);return new DOMMatrixReadOnly(s.transform).m41>0&&parseFloat(s.opacity)>0&&parseFloat(s.opacity)<1&&!e.inert})()");
    await resume(notice);await c.click(notice,'.update-dismiss');await c.check(notice,'update close finishes',"!document.querySelector('.update-notice')");
    assert.equal(updateTest.downloads,0);assert.equal(updateTest.installs,0);

    const debuggerApi=home.webContents.debugger;debuggerApi.attach('1.3');
    try{
      await debuggerApi.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await c.evaluate(home,"document.querySelector('.settings-button').click()");await c.pause(60);
      await c.check(home,'reduced motion skips the screen expansion',"!!document.querySelector('.settings-panel')&&!document.querySelector('.popup-tv-enter-active')&&getComputedStyle(document.querySelector('.settings-panel')).clipPath==='none'");
      await c.click(home,'[aria-label=关闭设置]');await c.check(home,'reduced motion close removes the surface promptly',"!document.querySelector('.modal-backdrop')");
    }finally{await debuggerApi.sendCommand('Emulation.setEmulatedMedia',{features:[]});debuggerApi.detach();}
  }finally{
    for(const win of [home,...windows])if(!win.isDestroyed())await c.evaluate(win,"document.getAnimations().forEach(a=>{if(a.playState==='paused')a.play()});document.querySelector('.appearance-close')?.click();document.querySelector('[aria-label=关闭设置]')?.click()").catch(()=>{});
    for(const win of windows)c.close(win);
    home.webContents.setZoomFactor(zoom);home.setBounds(bounds);if(maximized)home.maximize();c.program.updateSettings(settings);
  }
};
export default suite;
