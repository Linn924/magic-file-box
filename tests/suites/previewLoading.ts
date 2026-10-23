import type { Suite } from '../context';
import { holdPreviewResponses, releasePreviewResponses } from '../previewLoadDriver';
import {fixtureInScope} from '../scope';

const suite: Suite = async c => {
  for (const name of ['text.txt', 'data.json', 'document.docx', 'styled.xlsx', 'presentation.pptx', 'document.pdf', 'vector.svg'].filter(name=>fixtureInScope(c,name))) {
    holdPreviewResponses();
    let win = await c.program.openPath(c.fixture(name));
    try {
      await c.check(win, name + ' reports reading', "document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
      await c.check(win, name + ' shows a simple loading message without internal stages', "document.querySelector('.loading > span:not(.loading-spinner)')?.textContent==='正在加载…'&&!document.querySelector('.loading small,.loading .preview-retry')");
      await c.check(win, 'loading is centered without a cancel action', `(()=>{
        const body=document.querySelector('.preview-body').getBoundingClientRect(),card=document.querySelector('.loading').getBoundingClientRect();
        return Math.abs(card.left+card.width/2-body.left-body.width/2)<1&&Math.abs(card.top+card.height/2-body.top-body.height/2)<1&&!document.querySelector('.preview-cancel-load');
      })()`);
      if (name === 'text.txt') {
        c.program.updateSettings({theme:'dark'});win.unmaximize();win.setContentSize(560,420);win.webContents.setZoomFactor(1.5);
        await c.check(win, 'loading shows elapsed time after three seconds without actions', "Number(document.querySelector('.loading small')?.textContent.match(/已用 (\\d+) 秒/)?.[1])>=3&&!document.querySelector('.loading button')");
        await c.check(win, 'nine-second loading still has no reload action', "Number(document.querySelector('.loading small')?.textContent.match(/已用 (\\d+) 秒/)?.[1])===9&&!document.querySelector('.loading button')");
        await c.check(win, 'ten-second narrow loading shows only a reachable reload action', "(()=>{const el=document.querySelector('.loading .preview-retry');if(!el)return false;const b=el.getBoundingClientRect();return Number(document.querySelector('.loading small')?.textContent.match(/已用 (\\d+) 秒/)?.[1])>=10&&document.querySelectorAll('.loading button').length===1&&document.documentElement.dataset.theme==='dark'&&b.top>=0&&b.bottom<=innerHeight&&el.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2))})()");
        await c.check(win, 'reload button text stays centered', "(()=>{const s=getComputedStyle(document.querySelector('.preview-retry'));return /flex/.test(s.display)&&s.alignItems==='center'&&s.justifyContent==='center'&&s.textAlign==='center'})()");
        await c.snapshot(win, 'preview-loading-reload-dark');
        await c.click(win, '.loading .preview-retry');
        await c.check(win, 'reloading an in-flight attempt resets its timer and keeps loading', "document.querySelector('.preview-body')?.dataset.loadPhase==='reading'&&!document.querySelector('.loading small,.loading .preview-retry')&&document.querySelector('.loading > span:not(.loading-spinner)')?.textContent==='正在加载…'");
        win.webContents.setZoomFactor(1);win.setContentSize(1000,700);c.program.updateSettings({theme:'light'});
      }else{
        await c.click(win,'.tab-close');
        await c.pause(150);
        if(!win.isDestroyed())throw Error('Closing the last loading tab did not close its window');
        c.pass(name+' loading tab closes directly');
        win=await c.program.openPath(c.fixture(name));
        await c.check(win,name+' reopens with a fresh loading attempt',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
      }
      await c.evaluate(win, `(()=>{window.__loadPhases=[];window.__loadLabels=[];const body=document.querySelector('.preview-body');window.__loadObserver=new MutationObserver(()=>{window.__loadPhases.push(body.dataset.loadPhase);const text=body.querySelector('.loading > span:not(.loading-spinner)')?.textContent;if(text)window.__loadLabels.push(text);});window.__loadObserver.observe(body,{attributes:true,attributeFilter:['data-load-phase'],subtree:true,childList:true,characterData:true});})()`);
      releasePreviewResponses();
      await c.check(win, name + ' retry reaches ready', "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&!document.querySelector('.loading,.error')");
      await c.check(win, name + ' reports parsing and rendering', "window.__loadPhases.includes('parsing')&&window.__loadPhases.includes('rendering')");
      await c.check(win, name + ' keeps one user-facing message through parsing and display', "window.__loadLabels.length>0&&window.__loadLabels.every(label=>label==='正在加载…')");
      await c.evaluate(win, 'window.__loadObserver.disconnect()');
    } finally { releasePreviewResponses(); c.close(win); }
  }
  holdPreviewResponses();
  const tabs=(await c.program.openPaths([c.fixture('text.txt'),c.fixture('data.json')],'tabs'))[0];
  await c.check(tabs,'active tab starts reading',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
  await c.click(tabs,'.tab.active .tab-close');
  await c.check(tabs,'closing a loading tab leaves the other tab available',"document.querySelectorAll('.tab').length===1&&document.querySelector('.tab-name').textContent==='data.json'");
  releasePreviewResponses();
  await c.check(tabs,'late response cannot resurrect the closed tab',"document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&document.querySelectorAll('.preview-tab').length===1&&!document.body.textContent.includes('text.txt')");
  c.close(tabs);
  holdPreviewResponses();
  const switching=(await c.program.openPaths([c.fixture('text.txt'),c.fixture('data.json')],'tabs'))[0];
  await c.check(switching,'switching fixture starts reading',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
  await c.click(switching,'.tab .tab-name','data.json');
  releasePreviewResponses();
  await c.check(switching,'switching tabs lets both loads finish in the background',"document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
  await c.click(switching,'.tab .tab-name','text.txt');
  await c.check(switching,'returning to the background-loaded tab shows its completed preview',"[...document.querySelectorAll('.preview-tab')].find(t=>t.getClientRects().length)?.querySelector('.preview-body').dataset.loadPhase==='ready'");
  c.close(switching);
  holdPreviewResponses();
  const closing=await c.program.openPath(c.fixture('text.txt'));
  await c.check(closing,'close during reading starts with a task',"!!document.querySelector('.loading')");
  c.close(closing);releasePreviewResponses();
  const broken = await c.open('broken.docx');
  await c.click(broken, '.preview-retry');
  await c.check(broken, 'parse failure can retry and returns a clean error', "!!document.querySelector('.error .preview-retry')&&!document.querySelector('.loading')&&!document.querySelector('.word-host')");
  c.close(broken);
  if(fixtureInScope(c,'styled.xlsx')){
  const owner = await c.open('text.txt');
  const fileId = await c.evaluate<string>(owner, "document.querySelector('.preview-tab').dataset.fileId");
  await c.evaluate(owner, `window.__parserLease=window.localPreview.acquirePreviewParser(${JSON.stringify(fileId)},'held-parser')`);
  const queuedFile='styled.xlsx';
  let queued = await c.program.openPath(c.fixture(queuedFile));
  await c.check(queued, 'global parser slot queues another window', "document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
  await c.check(queued, 'queued work uses the same loading message', "document.querySelector('.loading > span:not(.loading-spinner)')?.textContent==='正在加载…'");
  await c.click(queued, '.tab-close');
  await c.pause(150);
  if(c.program.previewResourceStats().parsers!==1)throw Error('Closed queued tab retained its parser registration');
  queued=await c.program.openPath(c.fixture(queuedFile));
  await c.check(queued,'closed queued file can be reopened',"document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
  await c.evaluate(owner, "window.localPreview.releasePreviewParser('held-parser')");
  await c.check(queued, 'closing queued tab releases its place and reopening works', "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");
  c.close(queued);
  await c.evaluate(owner, `window.__parserLease=window.localPreview.acquirePreviewParser(${JSON.stringify(fileId)},'closed-owner')`);
  const next = await c.program.openPath(c.fixture(fixtureInScope(c,'table.csv')?'table.csv':'presentation.pptx'));
  await c.check(next, 'parser waits while owner is alive', "document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
  c.close(owner);
  await c.check(next, 'closing parser owner releases next window', "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");
  await c.check(c.home, 'preview IPC rejects another window file identity', `window.localPreview.acquirePreviewParser(${JSON.stringify(fileId)},'foreign').then(()=>false,()=>true)`);
  c.close(next);
  const reloading=await c.open('text.txt');
  const reloadId=await c.evaluate<string>(reloading,"document.querySelector('.preview-tab').dataset.fileId");
  await c.evaluate(reloading,`window.localPreview.acquirePreviewParser(${JSON.stringify(reloadId)},'reload-owner')`);
  const afterReload=await c.program.openPath(c.fixture(queuedFile));
  await c.check(afterReload,'parser waits before owner reload',"document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
  reloading.webContents.reload();
  await c.check(afterReload,'main-frame reload releases the old parser lease',"document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");
  c.close(reloading);c.close(afterReload);
  }else await parserQueueWithoutExcel(c);
  await c.pause(100);
  const stats = c.program.previewResourceStats();
  if (stats.reads || stats.parsers || stats.activeParsers) throw Error('Preview task resources leaked');
  c.pass('all reading and parser tasks released after cancellation, retry and window closure');
};
export default suite;

async function parserQueueWithoutExcel(c:import('../context').TestContext){
  const owner=await c.open('text.txt'),waiting=await c.open('data.json');
  const id=(win:Electron.BrowserWindow)=>c.evaluate<string>(win,"document.querySelector('.preview-tab').dataset.fileId");
  const ownerId=await id(owner),waitingId=await id(waiting);
  try{
    await c.evaluate(owner,`window.localPreview.acquirePreviewParser(${JSON.stringify(ownerId)},'scope-held')`);
    await c.evaluate(waiting,`window.scopeGranted=null;window.localPreview.acquirePreviewParser(${JSON.stringify(waitingId)},'scope-wait').then(value=>window.scopeGranted=value);true`);
    await c.check(waiting,'shared parser acquisition waits without loading an excluded format',"window.scopeGranted===null");
    await c.evaluate(waiting,"window.localPreview.releasePreviewParser('scope-wait')");
    await c.check(waiting,'cancel queued parser acquisition resolves without admission',"window.scopeGranted===false");
    await c.evaluate(owner,"window.localPreview.releasePreviewParser('scope-held')");
    await c.check(waiting,'queued parser retry obtains the released slot',`window.localPreview.acquirePreviewParser(${JSON.stringify(waitingId)},'scope-retry')`);
    await c.evaluate(waiting,"window.localPreview.releasePreviewParser('scope-retry')");
    await c.evaluate(owner,`window.localPreview.acquirePreviewParser(${JSON.stringify(ownerId)},'scope-closed-owner')`);
    await c.evaluate(waiting,`window.scopeGranted=null;window.localPreview.acquirePreviewParser(${JSON.stringify(waitingId)},'scope-after-close').then(value=>window.scopeGranted=value);true`);
    c.close(owner);await c.check(waiting,'closing parser owner admits the next window',"window.scopeGranted===true");await c.evaluate(waiting,"window.localPreview.releasePreviewParser('scope-after-close')");
    await c.check(c.home,'preview IPC rejects another window file identity',`window.localPreview.acquirePreviewParser(${JSON.stringify(waitingId)},'foreign').then(()=>false,()=>true)`);
    const reload=await c.open('text.txt'),reloadId=await id(reload);
    try{
      await c.evaluate(reload,`window.localPreview.acquirePreviewParser(${JSON.stringify(reloadId)},'scope-reload-owner')`);
      await c.evaluate(waiting,`window.scopeGranted=null;window.localPreview.acquirePreviewParser(${JSON.stringify(waitingId)},'scope-after-reload').then(value=>window.scopeGranted=value);true`);
      reload.webContents.reload();await c.check(waiting,'main-frame reload releases its parser lease',"window.scopeGranted===true");await c.evaluate(waiting,"window.localPreview.releasePreviewParser('scope-after-reload')");
    }finally{c.close(reload);}
  }finally{if(!owner.isDestroyed())c.close(owner);c.close(waiting);}
}
