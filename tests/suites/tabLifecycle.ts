import assert from 'node:assert/strict';
import type {Suite} from '../context';
import {holdPreviewResponses,releasePreviewResponses,previewLoadAttempts} from '../previewLoadDriver';
import {evictInactivePreviews} from '../previewPressure';
const suite:Suite=async c=>{
  holdPreviewResponses();
  const waiting=(await c.program.openPaths([c.fixture('text.txt'),c.fixture('data.json')],'tabs'))[0];
  try{
    await c.check(waiting,'first tab begins a single held load',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
    const id=await c.evaluate<string>(waiting,"document.querySelector('.preview-tab').dataset.fileId");
    await c.check(waiting,'original load elapsed time advances',"!!document.querySelector('.loading small')");
    await c.click(waiting,'.tab .tab-name','data.json');await c.pause(1100);
    await c.check(waiting,'hidden tab keeps its original load',"document.querySelectorAll('.preview-body[data-load-phase=reading]').length===2");
    await c.click(waiting,'.tab .tab-name','text.txt');
    await c.check(waiting,'tab return preserves the original loading clock',"Number(document.querySelector('.preview-tab:not([style*=none]) .loading small')?.textContent.match(/(\\d+) 秒/)?.[1])>=4");
    assert.equal(previewLoadAttempts(id),1,'switching must not send another file read');
    await c.click(waiting,'.tab .tab-name','data.json');releasePreviewResponses();
    await c.check(waiting,'both selected tabs finish without a foreground return',"document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
    assert.equal(previewLoadAttempts(id),1);
  }finally{releasePreviewResponses();c.close(waiting);}
  for(const name of ['text.txt','document.docx','styled.xlsx','presentation.pptx','document.pdf','image.png']){
    holdPreviewResponses();
    const win=(await c.program.openPaths([c.fixture(name),c.fixture('data.json')],'tabs'))[0];
    try{
      await c.check(win,name+' begins loading before switching away',"document.querySelector('.preview-body')?.dataset.loadPhase==='reading'");
      const id=await c.evaluate<string>(win,"document.querySelector('.preview-tab').dataset.fileId");
      await c.click(win,'.tab .tab-name','data.json');releasePreviewResponses();
      await c.check(win,name+' finishes initial loading while its tab is hidden',"document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
      assert.equal(previewLoadAttempts(id),1);
      await c.click(win,'.tab .tab-name',name);
      await c.check(win,name+' is ready before residency check',"document.querySelector('.preview-body')?.dataset.loadPhase==='ready'");
      await c.evaluate(win,"(()=>{const input=document.querySelector('.zoom-control input');input.value='137';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));window.__residentNode=document.querySelector('.preview-body').firstElementChild;})()");
      await c.click(win,'.tab .tab-name','data.json');
      await c.check(win,'comparison file is ready',"document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
      await c.pause(2200);
      await c.check(win,name+' stays mounted beyond the former two-second timeout',"window.__residentNode.isConnected&&document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
      await evictInactivePreviews(c,win);
      await c.check(win,name+' releases its rendered content under memory pressure',"!window.__residentNode.isConnected&&[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length)?.querySelector('.preview-body').dataset.loadPhase==='ready'");
      await c.click(win,'.tab .tab-name',name);
      await c.check(win,name+' restores its view after pressure eviction',"[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length)?.querySelector('.preview-body').dataset.loadPhase==='ready'&&[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length)?.querySelector('.zoom-control input').value==='137'");
    }finally{releasePreviewResponses();c.close(win);}
  }
  const gate=await c.open('text.txt'),gateId=await c.evaluate<string>(gate,"document.querySelector('.preview-tab').dataset.fileId");
  await c.evaluate(gate,`window.localPreview.acquirePreviewParser(${JSON.stringify(gateId)},'tab-lifecycle-gate')`);
  const source=(await c.program.openPaths([c.fixture('styled.xlsx'),c.fixture('text.txt')],'tabs'))[0];
  let target=await c.open('data.json');
  try{
    await c.check(source,'workbook waits for the existing cross-window parser limit',"document.querySelector('.preview-body')?.dataset.loadPhase==='queued'");
    const id=await c.evaluate<string>(source,"document.querySelector('.preview-tab').dataset.fileId");
    await c.evaluate(source,"(()=>{const i=document.querySelector('.zoom-control input');i.value='137';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()");
    await c.click(source,'.tab .tab-name','text.txt');
    await c.check(source,'queued workbook stays queued while another tab is used',"document.querySelector('.preview-tab[style*=none] .preview-body')?.dataset.loadPhase==='queued'");
    await c.evaluate(target,`window.localPreview.claim(${JSON.stringify(id)}).then(()=>true)`);
    c.close(target);await c.pause(150);
    await c.check(source,'failed target leaves the original loading tab intact',"document.querySelectorAll('.tab').length===2&&document.querySelector('.preview-tab[style*=none] .preview-body')?.dataset.loadPhase==='queued'");
    assert.equal(previewLoadAttempts(id),1);
    target=await c.open('data.json');
    await c.evaluate(target,`(()=>{const d=new DataTransfer();d.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}));})()`);
    await c.check(target,'loading workbook is accepted into the destination window',"document.querySelectorAll('.tab').length===2&&[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length)?.querySelector('.preview-body').dataset.loadPhase==='queued'");
    await c.check(source,'source removes only the accepted tab and keeps its other preview',"document.querySelectorAll('.tab').length===1&&document.querySelector('.tab-name').textContent==='text.txt'&&document.querySelector('.preview-body').dataset.loadPhase==='ready'");
    assert.equal(c.program.previewResourceStats().parsers,2,'only gate and destination retain parser registrations');
    assert.equal(previewLoadAttempts(id),2,'cross-renderer transfer starts exactly one destination load');
    await c.evaluate(gate,"window.localPreview.releasePreviewParser('tab-lifecycle-gate')");
    await c.check(target,'destination completes the moved workbook with its reading settings',"[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length)?.querySelector('.preview-body').dataset.loadPhase==='ready'&&[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length)?.querySelector('.zoom-control input').value==='137'&&!!document.querySelector('td[data-address=A1]')");
    await c.click(target,'.tab .tab-name','data.json');
    await c.check(target,'destination original file remains usable after merge',"document.querySelectorAll('.preview-body[data-load-phase=ready]').length===2");
    await evictInactivePreviews(c,target);
    await c.check(source,'destination pressure does not evict another window',"document.querySelector('.preview-body').dataset.loadPhase==='ready'&&!!document.querySelector('.preview-content')");
  }finally{c.close(source);c.close(target);c.close(gate);}
  await c.pause(150);
  const stats=c.program.previewResourceStats();assert.equal(stats.parsers,0);assert.equal(stats.reads,0);assert.equal(stats.activeParsers,0);
  c.pass('tab lifecycle preserves background tasks, pressure releases completed residents, transfer rollback/accept and window isolation release all tasks');
};
export default suite;
