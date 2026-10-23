import type { Suite,TestContext } from "../context";
import type { BrowserWindow } from 'electron';
import {fixtureInScope} from '../scope';
const suite = async (c:TestContext,pdfOnly=false) => {
  const state=(mode:string|undefined,zoom:number)=>`document.querySelector('.zoom-control input').value==='${zoom}'${mode?`&&document.querySelector('[aria-label=页面适配]').value==='${mode}'`:''}`;
  async function choose(win:BrowserWindow,mode:string|undefined,zoom:number){
    if(mode)await c.evaluate(win,`(()=>{const fit=document.querySelector('[aria-label=页面适配]');fit.value='${mode}';fit.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await c.evaluate(win,`(()=>{const input=document.querySelector('.zoom-control input');input.focus();input.value='${zoom}';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await c.evaluate(win,"(()=>{const input=document.querySelector('.zoom-control input');input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));input.blur();})()");
    await c.check(win,`reading selection is ${mode??'zoom'} at ${zoom}%`,state(mode,zoom));
  }
  async function roundTrip(win:BrowserWindow,name:string,mode:string|undefined,zoom:number){
    await choose(win,mode,zoom);
    await c.click(win,'.immersive-toggle');
    await c.check(win,`${name} immersive entry keeps ${mode??'zoom'} and ${zoom}%`,`document.documentElement.classList.contains('immersive')&&${state(mode,zoom)}`);
    if(!win.isFullScreen()||c.home.isFullScreen())throw Error('Immersive must fullscreen only its preview');
    await c.click(win,'.immersive-toggle');
    await c.check(win,`${name} immersive exit restores ${mode??'zoom'} and ${zoom}%`,`!document.documentElement.classList.contains('immersive')&&${state(mode,zoom)}`);
  }
  if(fixtureInScope(c,'document.pdf')){
  const win = await c.open("document.pdf");
  await choose(win,'original',137);
  await c.evaluate(win, "document.querySelector('.pdf-scroll').scrollTop=100");
  await c.click(win, ".immersive-toggle");
  await c.pause(400);
  if (!win.isFullScreen() || c.home.isFullScreen())
    throw Error("Native fullscreen must affect only preview window");
  await c.check(
    win,
    "immersive removes window chrome and reserves whole viewport",
    "document.documentElement.classList.contains('immersive')&&getComputedStyle(document.querySelector('.tabs')).display==='none'&&document.querySelector('.pdf-scroll').clientHeight>=innerHeight-2",
  );
  await c.check(win,'PDF immersive entry preserves default display and custom zoom',state('original',137));
  for (const mode of ["width", "page"]) {
    await c.evaluate(
      win,
      `(()=>{const el=document.querySelector('[aria-label=页面适配]');el.value='${mode}';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await c.pause(250);
    await c.check(
      win,
      "PDF " + mode + " preserves aspect ratio",
      "(()=>{const p=document.querySelector('.pdf-page').getBoundingClientRect();return Math.abs(p.width/p.height-5/3)<0.01})()",
    );
    if (mode === "page")
      await c.check(
        win,
        "whole page fits fullscreen",
        "document.querySelector('.pdf-page').getBoundingClientRect().height<=document.querySelector('.pdf-scroll').clientHeight",
      );
  }
  await c.snapshot(win, "immersive-pdf");
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await c.pause(450);
  if (win.isFullScreen()) throw Error("Escape must exit fullscreen");
  await c.check(
    win,
    "exit restores controls and mode",
    "!document.documentElement.classList.contains('immersive')&&"+state('original',137),
  );
  await roundTrip(win,'PDF','width',125);
  await roundTrip(win,'PDF','page',150);
  await choose(win,'original',137);
  await c.click(win,'.pdf-present');
  await c.check(win,'PDF presentation still uses a single fitted page',"!!document.querySelector('.pdf-presentation')&&document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelectorAll('.pdf-row .pdf-page').length===1&&document.querySelector('.pdf-page').getBoundingClientRect().height<=document.querySelector('.pdf-scroll').clientHeight");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await c.check(win,'leaving PDF presentation restores the selected reading mode and zoom',"!document.querySelector('.pdf-presentation')&&!document.documentElement.classList.contains('immersive')&&"+state('original',137));
  c.close(win);
  }
  if(pdfOnly)return;
  for (const [name, expression] of [
    [
      "document.docx",
      "document.querySelector('.word-host').shadowRoot.querySelector('section.docx')",
    ],
    [
      "presentation.pptx",
      "document.querySelector('.slide-host').shadowRoot.querySelector('.slide-page')",
    ],
    ["vector.svg", "document.querySelector('.image img')"],
  ]) {
    if(!fixtureInScope(c,name))continue;
    const preview = await c.open(name);
    const ratio = await c.evaluate<number>(
      preview,
      `(()=>{const r=${expression}.getBoundingClientRect();return r.width/r.height})()`,
    );
    for (const mode of ["width", "page"]) {
      await c.evaluate(
        preview,
        `(()=>{const el=document.querySelector('[aria-label=页面适配]');el.value='${mode}';el.dispatchEvent(new Event('change',{bubbles:true}))})()`,
      );
      await c.pause(200);
      await c.check(
        preview,
        `${name} ${mode} preserves proportions`,
        `(()=>{const r=${expression}.getBoundingClientRect();return r.width>1&&r.height>1&&Math.abs(r.width/r.height-${ratio})<0.02})()`,
      );
    }
    await roundTrip(preview,name,'width',125);
    c.close(preview);
  }
  for(const name of ['styled.xlsx','text.txt']){
    if(!fixtureInScope(c,name))continue;
    const preview=await c.open(name);
    try{await roundTrip(preview,name,undefined,137);}finally{c.close(preview);}
  }
};
export const pdfImmersive:Suite=c=>suite(c,true);
export default suite;
