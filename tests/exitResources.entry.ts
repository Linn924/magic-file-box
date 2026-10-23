import {app,BrowserWindow,dialog} from 'electron';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {holdPreviewResponses,installPreviewLoadDriver} from './previewLoadDriver';

const mode=process.argv[process.argv.indexOf('--case')+1];
const profile=app.commandLine.getSwitchValue('user-data-dir');
const command=path.join(profile,'exit-command.json');
const config=JSON.parse(readFileSync(path.join(profile,'exit-fixtures.json'),'utf8')) as Record<string,string>;
installPreviewLoadDriver();
app.on('browser-window-created',(_event,win)=>win.webContents.setBackgroundThrottling(false));
const program=require('../electron-dist/main.cjs') as typeof import('../electron/main');
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const emit=(event:string,value:Record<string,unknown>={})=>process.stdout.write('__EXIT_RESOURCE__'+JSON.stringify({event,mode,pid:process.pid,...value})+'\n');
let requesting=false,failed=false;
function fail(cause:unknown){if(failed)return;failed=true;emit('failure',{error:String(cause)});app.exit(1);}
process.on('unhandledRejection',fail);
process.on('uncaughtException',fail);
const watchdog=setTimeout(()=>fail('Exit-resource case timed out'),90000);
const evaluate=<T=unknown>(win:BrowserWindow,expression:string):Promise<T>=>win.webContents.executeJavaScript(expression);
async function check(win:BrowserWindow,label:string,expression:string){
  for(let i=0;i<300;i++){if(win.isDestroyed())throw Error(label+': window destroyed');if(await evaluate(win,expression)){emit('check',{label});return;}await pause(75);}
  throw Error(label);
}
async function open(file:string){const win=await program.openPath(file);await check(win,'preview ready: '+path.basename(file),"document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");return win;}
const metrics=()=>app.getAppMetrics().map(item=>({pid:item.pid,type:item.type,workingSetKiB:item.memory.workingSetSize}));
app.on('will-quit',()=>{
  if(!requesting||failed)return;
  const windows=BrowserWindow.getAllWindows().filter(win=>!win.isDestroyed()).length;
  const snapshot={event:'will-quit',mode,pid:process.pid,windows,stats:program.previewResourceStats(),metrics:metrics()};
  writeFileSync(path.join(profile,'exit-final.json'),JSON.stringify(snapshot,null,2));
  emit('will-quit',snapshot);
  if(windows)fail('True exit left application windows alive');
  clearTimeout(watchdog);
});
program.ready.then(async home=>{
  if(!home)throw Error('Home did not start');
  program.updateSettings({openHomeAction:'keep',closeAction:'quit',checkUpdatesOnStart:false,multiFileMode:'windows'});
  await check(home,'home ready',"!!document.querySelector('.dropzone')");
  let atExit=()=>Promise.resolve<Record<string,unknown>>({});
  if(mode==='reading'){
    holdPreviewResponses();
    const win=await program.openPath(config.text);
    await check(win,'held byte response leaves loading UI pending',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
    atExit=async()=>({phase:await evaluate(win,"document.querySelector('.preview-body')?.dataset.loadPhase")});
  }else if(mode==='parsing'){
    const win=await program.openPath(config.worker);
    await check(win,'real workbook Worker is parsing',"document.querySelector('.preview-body')?.dataset.loadPhase==='parsing'");
    const queued=await program.openPath(config.workbook);
    await check(queued,'second window holds a queued parser',"document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
    atExit=async()=>{
      const phase=await evaluate<string>(win,"document.querySelector('.preview-body')?.dataset.loadPhase");
      if(!['parsing','rendering'].includes(phase)||program.previewResourceStats().activeParsers!==1)throw Error('Actual parse finished before exit was requested');
      return {phase,queued:await evaluate(queued,"document.querySelector('.preview-body')?.dataset.loadPhase")};
    };
  }else if(mode==='source-read'){
    const win=await open(config.largeText);
    await evaluate(win,"(()=>{const input=document.querySelector('[aria-label=大文件查找]');input.value='exit-special-no-such-local-record';input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()");
    await check(win,'actual large-text scan started',"!!document.querySelector('.source-loading')");
    // Keep a real file-backed session open even if the scan finishes before the
    // external process census; the first observed snapshot records active I/O.
    if(program.previewResourceStats().sourceHandles<1)throw Error('Source file handle was not opened');
    atExit=async()=>({sourceBusy:await evaluate(win,"!!document.querySelector('.source-loading')")});
  }else if(mode==='password'){
    const win=await program.openPath(config.password);
    await check(win,'actual encrypted PDF waits for password',"document.querySelector('.preview-body')?.dataset.loadPhase==='password'&&!!document.querySelector('.pdf-password')");
  }else if(mode==='multi-cache'||mode==='dirty-cancel'){
    const groups=[[config.pdf,config.code],[config.word,config.image],[config.workbook,config.ppt]];
    const resident:BrowserWindow[]=[];
    for(const group of groups){
      const win=(await program.openPaths(group,'tabs'))[0];resident.push(win);
      await check(win,'first cached tab ready',"document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");
      await evaluate(win,"document.querySelectorAll('.tab-name')[1].click()");
      await check(win,'both tab previews remain resident',"document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
    }
    // Hidden PDF bitmaps are intentionally pruned. Activate it again to ensure
    // the exit scenario owns a real raster allocation as well as parsed caches.
    await evaluate(resident[0],"document.querySelectorAll('.tab-name')[0].click()");
    await check(resident[0],'PDF raster cache contains real canvas pixels',"[...document.querySelectorAll('.pdf-page canvas')].some(canvas=>canvas.width>100&&canvas.height>100)");
    await check(resident[1],'decoded image and Blob URL remain cached',"[...document.querySelectorAll('img')].some(img=>img.complete&&img.naturalWidth>0&&img.src.startsWith('blob:'))");
    await open(config.largeText);
    if(program.previewResourceStats().sourceHandles<1)throw Error('Cache scenario has no open source handle');
    if(mode==='dirty-cancel'){
      const win=resident[2];await evaluate(win,"document.querySelectorAll('.tab-name')[0].click()");
      await check(win,'workbook edit tools available',"!!document.querySelector('.excel-edit-toggle:not(:disabled)')");
      await evaluate(win,"document.querySelector('.excel-edit-toggle').click()");
      await check(win,'edit input available',"!!document.querySelector('.excel-cell-input')");
      await evaluate(win,"(()=>{const input=document.querySelector('.excel-cell-input');input.value='unsaved exit resource input';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
      dialog.showMessageBoxSync=(()=>1) as typeof dialog.showMessageBoxSync;
      const count=BrowserWindow.getAllWindows().length;app.quit();await pause(200);
      if(BrowserWindow.getAllWindows().length!==count||win.isDestroyed())throw Error('Cancelled dirty exit destroyed windows');
      await check(win,'cancelled exit keeps the draft and cache alive',"document.querySelector('.excel-cell-input')?.value==='unsaved exit resource input'&&document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
      dialog.showMessageBoxSync=(()=>0) as typeof dialog.showMessageBoxSync;
    }else{
      program.updateSettings({closeAction:'tray'});home.close();await pause(150);
      if(home.isDestroyed()||home.isVisible())throw Error('Tray hide exited or failed to hide');
      emit('check',{label:'tray hide keeps the real app and resident previews alive'});
    }
  }else if(mode==='restart-clean'){
    const stats=program.previewResourceStats();
    if(BrowserWindow.getAllWindows().length!==1||[stats.paths,stats.pdfWindows,stats.reads,stats.parsers,stats.activeParsers,stats.sourceSessions,stats.sourceHandles,stats.sourceReads].some(value=>value!==0))throw Error('Restart restored a previous file session');
    await check(home,'restarted profile has no preview files',"!document.querySelector('.preview-tab,.tab')&&!!document.querySelector('.dropzone')");
  }else throw Error('Unknown exit-resource case');
  emit('prepared',{stats:program.previewResourceStats(),metrics:metrics(),windows:BrowserWindow.getAllWindows().length});
  const commands=setInterval(()=>{
    if(!existsSync(command)||requesting)return;
    requesting=true;clearInterval(commands);
    void atExit().then(details=>{
      emit('exit-requested',{...details,stats:program.previewResourceStats(),metrics:metrics()});
      if(mode==='reading'||mode==='parsing'||mode==='source-read'||mode==='password')home.close();else app.quit();
    }).catch(fail);
  },50);
}).catch(fail);
