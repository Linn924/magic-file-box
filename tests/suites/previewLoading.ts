import type { Suite } from '../context';
import { holdPreviewResponses, holdStartupResponse, releasePreviewResponses } from '../previewLoadDriver';
import {fixtureInScope} from '../scope';

const suite: Suite = async c => {
  if (fixtureInScope(c,'text.txt')) {
    const releaseFiles = holdStartupResponse('preview:consume');
    holdPreviewResponses();
    try {
      const opening = await c.program.openPath(c.fixture('text.txt'));
      try {
        await c.check(opening,'a single preview card appears while waiting for file delivery',
          "document.querySelectorAll('.loading').length===1&&!document.querySelector('#startup-status,.preview-tab')");
        await c.evaluate(opening,"window.__openingCard=document.querySelector('.preview-file-loading')");
        await c.check(opening,'file delivery shows elapsed time without an unavailable retry',
          "Number(document.querySelector('.loading small')?.textContent.match(/(\\d+) 秒/)?.[1])>=10&&!document.querySelector('.loading button')");
        releaseFiles();
        await c.check(opening,'reading retains the same card, elapsed time and enables retry',
          "document.querySelector('.preview-body')?.dataset.loadPhase==='reading'&&document.querySelector('.preview-file-loading')===window.__openingCard&&document.querySelectorAll('.loading').length===1&&Number(window.__openingCard.querySelector('small')?.textContent.match(/(\\d+) 秒/)?.[1])>=10&&!!window.__openingCard.querySelector('button')");
        await c.click(opening,'.loading .preview-retry');
        await c.check(opening,'retry starts a fresh clock on the same card',
          "document.querySelector('.preview-file-loading')===window.__openingCard&&!document.querySelector('.loading small,.loading button')");
        releasePreviewResponses();
        await c.check(opening,'ready content replaces the opening card',
          "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&!window.__openingCard.isConnected");
      } finally {
        c.close(opening);
      }
    } finally {
      releaseFiles();
      releasePreviewResponses();
    }
  }
  for (const name of ['text.txt', 'data.json', 'document.docx', 'styled.xlsx', 'presentation.pptx', 'document.pdf', 'vector.svg'].filter(name=>fixtureInScope(c,name))) {
    holdPreviewResponses();
    let win = await c.program.openPath(c.fixture(name));
    try {
      await c.check(win, name + ' reports reading', "document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
      await c.check(win,'initial reading displays one card',"document.querySelectorAll('.loading').length===1&&!document.querySelector('#startup-status')");
      if(name!=='text.txt'){
        await c.click(win,'.tab-close');
        await c.pause(150);
        if(!win.isDestroyed())throw Error('Closing the last loading tab did not close its window');
        c.pass(name+' loading tab closes directly');
        win=await c.program.openPath(c.fixture(name));
        await c.check(win,name+' reopens with a fresh loading attempt',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
      }
      await c.evaluate(win, `(()=>{window.__loadPhases=[];window.__loadCards=[];const body=document.querySelector('.preview-body');const card=body.querySelector('.preview-file-loading');window.__loadObserver=new MutationObserver(()=>{window.__loadPhases.push(body.dataset.loadPhase);if(body.querySelector('.preview-file-loading')===card&&document.querySelectorAll('.loading').length===1)window.__loadCards.push(body.dataset.loadPhase);});window.__loadObserver.observe(body,{attributes:true,attributeFilter:['data-load-phase']});})()`);
      releasePreviewResponses();
      await c.check(win, name + ' retry reaches ready', "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&!document.querySelector('.loading,.error,.preview-content-pending')");
      await c.check(win, name + ' reports parsing and rendering', "window.__loadPhases.includes('parsing')&&window.__loadPhases.includes('rendering')");
      await c.check(win, name + ' keeps the same card during parsing and rendering', "window.__loadCards.includes('parsing')&&window.__loadCards.includes('rendering')");
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
  await c.check(closing,'close during reading starts with a task',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
  for(const [width,height] of [[720,520],[960,680]]){
    closing.unmaximize();
    closing.setContentSize(width,height);
    await c.check(closing,'loading remains centered after resizing', `(()=>{const card=document.querySelector('.preview-file-loading')?.getBoundingClientRect();return innerWidth===${width}&&innerHeight===${height}&&!!card&&Math.abs(card.x+card.width/2-innerWidth/2)<=1&&Math.abs(card.y+card.height/2-innerHeight/2)<=1})()`);
  }
  c.close(closing);releasePreviewResponses();
  const broken = await c.open('broken.docx');
  holdPreviewResponses();
  await c.click(broken, '.preview-retry');
  await c.check(broken,'retry after failure uses HTML loading',
    "document.querySelector('.loading > span:not(.loading-spinner)')?.textContent==='正在加载资源…'");
  await c.check(broken,'subsequent long retry retains its reload action',
    "Number(document.querySelector('.loading small')?.textContent.match(/已用 (\\d+) 秒/)?.[1])>=10&&!!document.querySelector('.loading .preview-retry')");
  await c.click(broken,'.loading .preview-retry');
  await c.check(broken,'subsequent reload resets its timer',
    "!!document.querySelector('.loading')&&!document.querySelector('.loading small,.loading button')");
  releasePreviewResponses();
  await c.check(broken, 'parse failure can retry and returns a clean error', "!!document.querySelector('.error .preview-retry')&&!document.querySelector('.loading')&&!document.querySelector('.word-host')");
  c.close(broken);
  if(fixtureInScope(c,'styled.xlsx')){
  const owner = await c.open('text.txt');
  const fileId = await c.evaluate<string>(owner, "document.querySelector('.preview-tab').dataset.fileId");
  await c.evaluate(owner, `window.__parserLease=window.localPreview.acquirePreviewParser(${JSON.stringify(fileId)},'held-parser')`);
  const queuedFile='styled.xlsx';
  let queued = await c.program.openPath(c.fixture(queuedFile));
  await c.check(queued, 'global parser slot queues another window', "document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
  await c.check(queued, 'queued work displays one card', "document.querySelectorAll('.loading').length===1&&!document.querySelector('#startup-status')");
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
