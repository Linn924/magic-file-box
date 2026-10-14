import assert from 'node:assert/strict';
import type {Suite} from '../context';
const suite:Suite=async c=>{
  const expected=process.env.FILE_PREVIEW_EDITION||'main';if(!['main','mind'].includes(expected))throw Error('未知启动版本。');
  await c.check(c.home,'startup uses expected edition '+expected,`document.documentElement.dataset.edition===${JSON.stringify(expected)}`);
  if(expected==='main'){
    await c.check(c.home,'main has no personal title, canvas or intro marker',"!document.querySelector('.home-intro,.home-intro-title,.home-intro-canvas')&&!document.body.textContent.includes('小乖专属软件')&&!localStorage.getItem('fp-home-intro-v1')");
  }else{
    await c.check(c.home,'mind first home shows its personal title',"document.querySelector('.home-intro-title')?.textContent==='小乖专属软件'&&localStorage.getItem('fp-home-intro-v1')==='1'");
    if(!await c.evaluate(c.home,"matchMedia('(prefers-reduced-motion: reduce)').matches"))await c.check(c.home,'mind fireworks actually draw and do not block opening files',"(()=>{const canvas=document.querySelector('.home-intro-canvas'),button=document.querySelector('.dropzone');if(!canvas?.width||!button)return false;const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0)})()");
    await c.snapshot(c.home,'mind-startup');
  }
  const preview=await c.open('text.txt');try{await c.check(preview,'preview windows have no startup decoration',"!document.querySelector('.home-intro,.home-intro-title,.home-intro-canvas')");}finally{c.close(preview);}
  c.home.webContents.reload();await c.check(c.home,'home reload is ready',"!!document.querySelector('.dropzone')");await c.pause(200);
  assert.equal(await c.evaluate(c.home,"!!document.querySelector('.home-intro-title')"),false);
  if(expected==='main')assert.equal(await c.evaluate(c.home,"!!document.querySelector('.home-intro')"),false);
  c.pass('home reload does not replay first-launch decoration');
};
export default suite;
