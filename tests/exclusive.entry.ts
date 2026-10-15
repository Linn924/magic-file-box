import {app} from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {randomUUID,sign} from 'node:crypto';
const [stage,profile,fixture]=process.argv.slice(2);
app.setPath('userData',path.resolve(profile));
const program=require('../electron/main') as typeof import('../electron/main');
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function wait(check:()=>Promise<unknown>,name:string){for(let i=0;i<160;i++){if(await check()){console.log('PASS '+name);return;}await pause(75);}throw Error(name);}
const timeout=setTimeout(()=>{console.error('Exclusive test timeout');app.exit(1);},45000);
program.ready.then(async home=>{
 if(!home)throw Error('Test home missing');
 const evaluate=(s:string)=>home.webContents.executeJavaScript(s);
 await wait(()=>evaluate("!!document.querySelector('.dropzone')"),'exclusive test home ready');
 program.updateSettings({checkUpdatesOnStart:false,closeAction:'quit'});
 const settings=async()=>{await evaluate("document.querySelector('.settings-button').click()");await wait(()=>evaluate("!!document.querySelector('#exclusive-key:not(:disabled)')"),'exclusive setting available');};
 if(stage==='activate'){
  await wait(()=>evaluate("document.documentElement.dataset.exclusive==='false'&&!document.querySelector('.home-intro')"),'no effects without activation');
  await settings();
  await evaluate("(()=>{const e=document.querySelector('#exclusive-key');e.value='<script>window.exclusiveXss=true</script>';e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait(()=>evaluate("!document.querySelector('.exclusive-confirm').disabled"),'KEY input enables confirmation');await evaluate("document.querySelector('.exclusive-confirm').click()");
  await wait(()=>evaluate("document.querySelector('.exclusive-message').textContent==='KEY 无效或与本软件不匹配。'&&!window.exclusiveXss"),'invalid KEY is data and cannot execute code');
  const {privateKey}=JSON.parse(readFileSync(fixture,'utf8'));
  const payload={v:1,product:'magic-file-box',id:randomUUID(),subject:'Test recipient',profile:'welcome-01',features:['welcome'],issuedAt:Date.now()};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url'),data='MFB1.'+body,token=data+'.'+sign(null,Buffer.from(data),privateKey).toString('base64url');
  await evaluate(`(()=>{const e=document.querySelector('#exclusive-key');e.value=${JSON.stringify(token)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait(()=>evaluate("!document.querySelector('.exclusive-confirm').disabled"),'valid KEY enables confirmation');await evaluate("document.querySelector('.exclusive-confirm').click()");
  await wait(()=>evaluate("document.querySelector('.exclusive-message').textContent.includes('重启')&&document.querySelector('#exclusive-key').value===''"),'confirmed KEY clears input and requests restart');
  const state=await evaluate('window.localPreview.getExclusiveState()');assert.equal(state.active,false);assert.equal(state.pendingRestart,true);
  assert.ok(!readFileSync(path.join(profile,'exclusive.bin')).includes(token));assert.equal(await evaluate("!!document.querySelector('.home-intro')"),false);
  console.log('PASS activated data is encrypted and does not change services before restart');
 }else if(stage==='verify'){
  await wait(()=>evaluate("document.documentElement.dataset.exclusive==='true'&&document.querySelector('.home-intro-title')?.textContent==='小乖专属软件'"),'restart verifies persisted KEY and enables the selected service');
  const reduce=await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
  if(!reduce)await wait(()=>evaluate("(()=>{const c=document.querySelector('.home-intro-canvas');return c?.width>0&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)})()"),'exclusive effect draws actual canvas pixels');
  assert.equal(await evaluate("(()=>{const b=document.querySelector('.dropzone'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()"),true,'exclusive effect does not intercept the open-file control');
  const preview=await program.openPath(path.resolve('work/fixtures/text.txt'));await wait(()=>preview.webContents.executeJavaScript("!!document.querySelector('.line-body')&&!document.querySelector('.home-intro')"),'exclusive effects only belong to home');program.closePreview(preview);
  await wait(()=>evaluate("!document.querySelector('.home-intro')"),'completed effect releases its DOM');
  home.webContents.debugger.attach('1.3');
  try{
   await home.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   await evaluate("localStorage.removeItem('mfb-exclusive-intro-v1')");home.webContents.reload();
   await wait(()=>evaluate("(()=>{const t=document.querySelector('.home-intro-title'),c=document.querySelector('.home-intro-canvas');return t&&getComputedStyle(t).animationName==='none'&&c&&getComputedStyle(c).display==='none'})()"),'reduced motion shows static service text without animation');
   await wait(()=>evaluate("!document.querySelector('.home-intro')"),'reduced-motion effect also releases DOM');
  }finally{await home.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});home.webContents.debugger.detach();}
  await settings();await evaluate("document.querySelector('.exclusive-clear').click()");
  await wait(()=>evaluate("document.querySelector('.exclusive-message').textContent.includes('重启')"),'restoring standard service also waits for restart');
  assert.equal((await evaluate('window.localPreview.getExclusiveState()')).active,true);
 }else{
  await wait(()=>evaluate("document.documentElement.dataset.exclusive==='false'&&!document.querySelector('.home-intro')"),'restart after reset restores standard service');
 }
 clearTimeout(timeout);app.quit();
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
