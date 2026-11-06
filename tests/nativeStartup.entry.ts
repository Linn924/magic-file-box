import {app,BrowserWindow,ipcMain,screen,nativeImage} from 'electron';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const scale=process.argv.find(value=>value.startsWith('--dpi='))?.split('=')[1]??'1';
app.commandLine.appendSwitch('force-device-scale-factor',scale);
const profile=path.resolve('work/native-startup-check-'+process.pid);
mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
writeFileSync(path.join(profile,'preferences.json'),JSON.stringify({
  theme:'dark',openHomeAction:'keep',closeAction:'quit',checkUpdatesOnStart:false,
}));
const file=path.join(profile,'native-check.txt');
writeFileSync(file,'Native startup verification');
const hash=()=>createHash('sha256').update(readFileSync(file)).digest('hex');
const before=hash();
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function visibleArc(filename:string,theme:'light'|'dark'){
  const bitmap=nativeImage.createFromPath(filename).toBitmap();
  const accent=theme==='dark'?[96,165,250]:[15,108,189];
  let pixels=0;
  for(let i=0;i<bitmap.length;i+=4){
    if(Math.abs(bitmap[i+2]-accent[0])<12&&Math.abs(bitmap[i+1]-accent[1])<12&&
      Math.abs(bitmap[i]-accent[2])<12)pixels++;
  }
  assert.ok(pixels>10,'screen capture must contain the visible loading arc');
  return pixels;
}
let held=false;
let heldHome=true;
const pending=new Set<()=>void>();
const homePending=new Set<()=>void>();
function release(){
  held=false;
  for(const resolve of pending)resolve();
  pending.clear();
}
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,!['preview:load','settings:get'].includes(channel)?listener:async(event,...args)=>{
  const value=await listener(event,...args);
  if(channel==='preview:load'&&held)await new Promise<void>(resolve=>pending.add(resolve));
  if(channel==='settings:get'&&heldHome)await new Promise<void>(resolve=>homePending.add(resolve));
  return value;
});
process.on('uncaughtException',error=>{console.error(error);app.exit(1);});
const program=require('../electron-dist/main.cjs') as typeof import('../electron/main');
async function check(win:BrowserWindow){
  for(let i=0;i<200;i++){
    if(await win.webContents.executeJavaScript("document.querySelector('.preview-body')?.dataset.loadPhase==='ready'"))return;
    await pause(20);
  }
  throw Error('Preview failed to become ready');
}
program.ready.then(async home=>{
  assert.ok(home);
  for(let i=0;i<200&&!program.startupLoadingStats(home.webContents.id).painted;i++)await pause(20);
  assert.ok(program.startupLoadingStats(home.webContents.id).painted,'home native loading must actually paint');
  home.setAlwaysOnTop(true);home.focus();await pause(250);
  const homeCapture=path.resolve('outputs/verification/native-home-'+scale+'.png');
  await program.captureStartupLoading(home.webContents.id,homeCapture);
  console.log(JSON.stringify({dpi:Number(scale),homeVisibleArcPixels:visibleArc(homeCapture,'dark')}));
  home.setAlwaysOnTop(false);
  heldHome=false;
  for(const resolve of homePending)resolve();
  homePending.clear();
  for(let i=0;i<200&&program.startupLoadingStats(home.webContents.id).bounds;i++)await pause(20);
  for(const theme of ['light','dark'] as const){
    program.updateSettings({theme});
    held=true;
    const win=await program.openPath(file);
    assert.ok(win);
    const id=win.webContents.id;
    for(const [width,height] of [[720,520],[960,680]]){
      win.unmaximize();win.setContentSize(width,height);await pause(100);
      const bounds=program.startupLoadingStats(id).bounds;
      assert.ok(bounds,'native loading must exist before the held file response completes');
      assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<=1);
      assert.ok(Math.abs(bounds.y+bounds.height/2-height/2)<=1);
    }
    for(let i=0;i<200&&!program.startupLoadingStats(id).painted;i++)await pause(20);
    assert.ok(program.startupLoadingStats(id).painted,'native helper must actually paint');
    const target=screen.dipToScreenRect(win,win.getContentBounds());
    const painted=program.startupLoadingStats(id).physicalBounds!;
    assert.ok(Math.abs(painted.x+painted.width/2-target.x-target.width/2)<=2);
    assert.ok(Math.abs(painted.y+painted.height/2-target.y-target.height/2)<=2);
    const capture=path.resolve('outputs/verification/native-visible-'+scale+'-'+theme+'.png');
    win.setAlwaysOnTop(true);
    win.focus();
    await pause(250);
    await program.captureStartupLoading(id,capture);
    win.setAlwaysOnTop(false);
    const accentPixels=visibleArc(capture,theme);
    const actual=screen.getDisplayMatching(win.getBounds()).scaleFactor;
    assert.ok(Math.abs(actual-Number(scale))<0.01);
    win.destroy();
    release();
    for(let i=0;i<100&&program.startupLoadingStats().processes;i++)await pause(20);
    assert.equal(program.startupLoadingStats(id).bounds,undefined);
    assert.equal(program.startupLoadingStats().timers,0);
    const reopened=await program.openPath(file);
    assert.ok(reopened);await check(reopened);
    for(let i=0;i<100&&program.startupLoadingStats(reopened.webContents.id).bounds;i++)await pause(20);
    assert.equal(program.startupLoadingStats(reopened.webContents.id).bounds,undefined);
    reopened.destroy();
    for(let i=0;i<100&&program.startupLoadingStats().processes;i++)await pause(20);
    assert.equal(program.startupLoadingStats().processes,0);
    console.log(JSON.stringify({dpi:actual,theme,centered:true,visibleArcPixels:accentPixels,closedCleanup:true,reopenedReady:true}));
  }
  assert.equal(hash(),before);
  assert.equal(program.startupLoadingStats().layers,0);
  assert.equal(program.startupLoadingStats().timers,0);
  app.exit();
}).catch(error=>{console.error(error);app.exit(1);});
