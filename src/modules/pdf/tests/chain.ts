import type {Suite} from '../../../../tests/context';
import {performanceFixture} from './performanceFixture';
import {encryptedFixture} from './encryptedFixture';
import {writeFileSync} from 'node:fs';
const suite:Suite=async c=>{
  writeFileSync(c.fixture('empty-test.pdf'),'');
  const broken=await c.program.openPath(c.fixture('empty-test.pdf'));
  await c.check(broken,'empty PDF reports failure without a stuck loading screen',"!!document.querySelector('.error')&&!document.querySelector('.loading')");
  c.close(broken);await c.pause(100);
  if(c.program.previewResourceStats().pdfWindows)throw Error('Failed parser retained PDF budget client');
  for(const permitted of [true,false]){
    const name=permitted?'encrypted-allowed.pdf':'encrypted-restricted.pdf';encryptedFixture(c.fixture(name),permitted);
    const win=await c.program.openPath(c.fixture(name));
    await c.check(win,'encrypted PDF asks for password','!!document.querySelector(".pdf-password")');
    await c.check(win,'password stage leaves input and cancel usable',"(()=>{const input=document.querySelector('.pdf-password input'),b=input.getBoundingClientRect();return document.querySelector('.preview-body').dataset.loadPhase==='password'&&document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===input&&!!document.querySelector('.preview-cancel-load')})()");
    await c.click(win,'.preview-cancel-load');
    await c.check(win,'password wait can be cancelled','!!document.querySelector(".preview-cancelled")&&!document.querySelector(".pdf-password")');
    await c.click(win,'.preview-retry');
    await c.check(win,'password retry asks again','!!document.querySelector(".pdf-password")');
    for(const password of ['wrong','secret']){
      await c.evaluate(win,`(()=>{const input=document.querySelector('.pdf-password input');input.value='${password}';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.pdf-password').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})()`);
      await c.check(win,password==='wrong'?'wrong password retains retry':'correct password renders actual encrypted file',password==='wrong'?"document.body.textContent.includes('密码不正确')":"!document.querySelector('.pdf-password')&&[...document.querySelectorAll('.pdf-page canvas')].some(c=>c.width>0)&&document.body.textContent.includes('Encrypted sample text')");
    }
    await c.check(win,'parsed permissions reach toolbar',permitted?"!!document.querySelector('.pdf-print-button:not(:disabled)')":"!document.querySelector('.pdf-print-button:not(:disabled)')");
    const settings=JSON.stringify(await c.program.settings.get());
    if(settings.includes('secret')||settings.includes('pdfPassword'))throw Error('Password leaked to settings');
    c.close(win);
  }
  performanceFixture(c.fixture('chain-invoice.pdf'),'invoice');
  const batch=await c.program.openPaths(Array(50).fill(c.fixture('chain-invoice.pdf')),'tabs');
  const win=batch[0];
  await c.check(win,'50 selected invoices only load active module',"document.querySelectorAll('.tab').length===50 && document.querySelectorAll('.pdf-pane').length===1 && [...document.querySelectorAll('.preview-tab')].filter(t=>getComputedStyle(t).display!=='none').every(t=>!t.querySelector('.loading')&&t.querySelector('canvas')?.width>0)");
  await c.evaluate(win,"(()=>{const z=document.querySelector('.zoom-control input');z.value='400';z.dispatchEvent(new Event('input',{bubbles:true}));z.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await c.pause(300);
  await c.check(win,'visible and temporary canvas pixels obey total window budget',"(()=>{const d=document.documentElement.dataset;return Number(d.pdfCanvasPixels)>0 && Number(d.pdfCanvasPixels)<=Number(d.pdfCanvasBudget)})()");
  const extra=await c.program.openPaths(Array(5).fill(c.fixture('chain-invoice.pdf')),'windows');
  for(const page of extra)await c.check(page,'multiwindow PDF has a bitmap',"[...document.querySelectorAll('.pdf-page canvas')].some(c=>c.width>0)");
  await c.pause(350);
  await c.check(win,'six windows reduce per-window raster allowance',"Number(document.documentElement.dataset.pdfCanvasBudget)<=8000000&&Number(document.documentElement.dataset.pdfCanvasPixels)<=Number(document.documentElement.dataset.pdfCanvasBudget)");
  for(const page of extra)c.close(page);
  await c.pause(350);
  await c.check(win,'closing windows recovers raster allowance',"Number(document.documentElement.dataset.pdfCanvasBudget)===24000000");
  c.close(win);
  await c.pause(150);
  const released=c.program.previewResourceStats();
  if(released.paths||released.pdfWindows)throw Error('Closed PDF windows retained resources '+JSON.stringify(released));
  c.pass('closing all PDF windows releases source paths and shared budget clients');
};
export default suite;
