import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';
import {withExif} from './toolsFixtures';
const suite:Suite=async c=>{
  const png='image-tools-v1.png',jpeg='image-exif-tools-v1.jpg',large='large-image-tools-v1.png',largeJpeg='large-image-exif-tools-v1.jpg';
  if(!existsSync(c.fixture(png))){const data=await c.evaluate<string>(c.home,"(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,40,20);x.fillStyle='#00ff00';x.fillRect(40,0,40,20);x.fillStyle='#0000ff';x.fillRect(0,20,40,20);x.fillStyle='#ffffff';x.fillRect(40,20,40,20);return c.toDataURL().split(',')[1]})()");writeFileSync(c.fixture(png),Buffer.from(data,'base64'));}
  if(!existsSync(c.fixture(jpeg))){const data=await c.evaluate<string>(c.home,"(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;return c.toDataURL('image/jpeg').split(',')[1]})()");writeFileSync(c.fixture(jpeg),withExif(Buffer.from(data,'base64'),6));}
  if(!existsSync(c.fixture(large)))writeFileSync(c.fixture(large),Buffer.concat([readFileSync(c.fixture(png)),Buffer.alloc(9*1024*1024)]));
  if(!existsSync(c.fixture(largeJpeg)))writeFileSync(c.fixture(largeJpeg),Buffer.concat([readFileSync(c.fixture(jpeg)),Buffer.alloc(9*1024*1024)]));
  const originals=[png,jpeg,large,largeJpeg].map(name=>({name,bytes:readFileSync(c.fixture(name))}));
  for(const name of [jpeg,largeJpeg]){const info=await c.open(name);
    try{await c.click(info,'.image-info-toggle');await c.check(info,'image information shows local EXIF values safely: '+name,"document.querySelector('.image-info').textContent.includes('Fixture Camera')&&document.querySelector('.image-info').textContent.includes('1/125 s')&&document.querySelector('.image-info').textContent.includes('2026:10:23')");await c.snapshot(info,name===jpeg?'image-exif-information':'large-image-exif-information');}finally{c.close(info);}
  }
  for(const name of [png,large]){
    const win=await c.open(name);try{
      win.webContents.debugger.attach('1.3');await c.check(win,'image color sampling tool is ready',"!!document.querySelector('.image-color-toggle')");await c.click(win,'.image-color-toggle');
      for(const rotation of [0,90,180,270]){
        if(rotation)await c.click(win,name===large?'.large-image-rotate':'.image-rotate');
        const slot=[{x:.25,y:.25,color:'#FF0000'},{x:.75,y:.25,color:'#00FF00'},{x:.25,y:.75,color:'#0000FF'},{x:.75,y:.75,color:'#FFFFFF'}][rotation/90];
        const point=await c.evaluate<{x:number;y:number}>(win,`(()=>{const el=document.querySelector(${JSON.stringify(name===large?'.large-image-preview canvas':'.image img')}),r=el.getBoundingClientRect(),s=getComputedStyle(el),dx=parseFloat(s.width)*(${slot.x}-.5),dy=parseFloat(s.height)*(${slot.y}-.5),a=${rotation}*Math.PI/180;return {x:r.left+r.width/2+dx*Math.cos(a)-dy*Math.sin(a),y:r.top+r.height/2+dx*Math.sin(a)+dy*Math.cos(a)}})()`);
        await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y});await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y});
        await c.check(win,`pixel sampling stays correct at ${rotation} degrees (${name})`,`document.querySelector('[aria-label=取样颜色值]')?.value===${JSON.stringify(slot.color)}`);
      }
      if(name===large)await c.check(win,'reduced image sampling identifies preview pixel coordinates',"document.querySelector('.image-color-result').textContent.includes('预览像素')");
      await c.evaluate(win,"window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");await c.check(win,'Escape exits sampling and keeps the sampled value selectable',"!document.querySelector('.image-pane').classList.contains('image-picking')&&document.querySelector('[aria-label=取样颜色值]').readOnly");
      c.program.updateSettings({theme:'dark'});await c.snapshot(win,name===large?'large-image-color-sample':'image-color-sample');
    }finally{if(win.webContents.debugger.isAttached())win.webContents.debugger.detach();c.program.updateSettings({theme:'light'});c.close(win);}
  }
  for(const original of originals)assert.deepEqual(readFileSync(c.fixture(original.name)),original.bytes);
  await c.pause(150);assert.equal(c.program.previewResourceStats().sourceSessions,0);assert.equal(c.program.previewResourceStats().sourceReads,0);c.pass('image tools preserve source bytes and release file-source sessions');
};
export default suite;
