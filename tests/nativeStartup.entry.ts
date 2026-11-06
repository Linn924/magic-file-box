import {app,BrowserWindow,ipcMain,screen} from 'electron';
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
let held=false;
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,channel!=='preview:load'?listener:async(event,...args)=>{
  const value=await listener(event,...args);
  if(held)await pause(2500);
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
    const actual=screen.getDisplayMatching(win.getBounds()).scaleFactor;
    assert.ok(Math.abs(actual-Number(scale))<0.01);
    win.destroy();
    assert.equal(program.startupLoadingStats(id).bounds,undefined);
    assert.equal(program.startupLoadingStats().timers,0);
    held=false;
    const reopened=await program.openPath(file);
    assert.ok(reopened);await check(reopened);
    for(let i=0;i<100&&program.startupLoadingStats(reopened.webContents.id).bounds;i++)await pause(20);
    assert.equal(program.startupLoadingStats(reopened.webContents.id).bounds,undefined);
    reopened.destroy();
    console.log(JSON.stringify({dpi:actual,theme,centered:true,closedCleanup:true,reopenedReady:true}));
  }
  assert.equal(hash(),before);
  assert.equal(program.startupLoadingStats().layers,0);
  assert.equal(program.startupLoadingStats().timers,0);
  app.exit();
}).catch(error=>{console.error(error);app.exit(1);});
