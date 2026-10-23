import assert from 'node:assert/strict';
import {createReadStream,statSync,writeFileSync} from 'node:fs';
import {app} from 'electron';
import {createHash} from 'node:crypto';
import type {Suite} from '../context';
import {sourceFixtures} from '../sourceFixtures';
import {fixtureInScope} from '../scope';
const hash=async(file:string)=>{const value=createHash('sha256');for await(const data of createReadStream(file))value.update(data);return value.digest('hex');};
const suite:Suite=async c=>{
  const fixtures=await sourceFixtures();
  const names=['txt','csv','json','xlsx','docx','pptx','pdf','image'] as const;
  const measurements:Array<Record<string,unknown>>=[];
  for(const name of names){
    if(!fixtureInScope(c,fixtures[name]))continue;
    const file=fixtures[name],before=await hash(file),baseline=c.program.previewResourceStats().sourceBytesRead,start=performance.now();
    const memory=()=>app.getAppMetrics().reduce((sum,process)=>sum+process.memory.workingSetSize,0)/1024;
    const initialMemory=memory();let peakMemory=initialMemory;
    const sample=setInterval(()=>{peakMemory=Math.max(peakMemory,memory());},50);
    const win=await c.program.openPath(file);
    try{
      await c.check(win,name+' large source reaches ready',"document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&!document.querySelector('.error')");
      const elapsed=Math.round(performance.now()-start),read=c.program.previewResourceStats().sourceBytesRead-baseline;
      if(name!=='image')assert.ok(read<16*1024*1024,`${name} first viewport must not read the full source: ${read}`);
      c.pass(`${name}: ${Math.round(statSync(file).size/1024/1024)} MiB, first ready ${elapsed} ms, main range reads ${read} bytes`);
      measurements.push({name,bytes:statSync(file).size,firstReadyMs:elapsed,firstReadBytes:read,initialWorkingSetMiB:initialMemory});
      if(['txt','csv','json'].includes(name)){
        await c.check(win,'bounded record DOM',"document.querySelectorAll('[data-source-row]').length>0&&document.querySelectorAll('[data-source-row]').length<=100");
        if(name==='csv')await c.check(win,'large CSV preserves multiline and quoted fields',"document.querySelector('tbody tr td:nth-child(2)').textContent==='00123'&&document.querySelector('tbody tr td:nth-child(3)').textContent==='comma, value'&&document.querySelector('tbody tr td:nth-child(4)').textContent==='two\\nlines'");
        await c.click(win,'.source-footer button','下一段');
        await c.check(win,'next records load',"Number(document.querySelector('[data-source-row]')?.dataset.sourceRow)>0&&!document.querySelector('.source-loading')");
        await c.click(win,'.source-footer button','上一段');
        await c.check(win,'previous records restore start',"document.querySelector('[data-source-row]')?.dataset.sourceRow==='0'&&!document.querySelector('.source-loading')");
        await c.evaluate(win,"(()=>{const input=document.querySelector('[aria-label=大文件起始位置]');input.value='1001';input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()");
        await c.check(win,'jump reaches requested logical record',"document.querySelector('[data-source-row]')?.dataset.sourceRow==='1000'&&!document.querySelector('.source-loading')");
        await c.evaluate(win,"(()=>{const input=document.querySelector('[aria-label=大文件查找]');input.value='not-present-local-test';input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()");
        await c.check(win,'background scan is cancellable',"!!document.querySelector('.source-loading .preview-cancel-load')");
        await c.check(win,'record loading uses the simple loading message',"document.querySelector('.source-loading > span:not(.loading-spinner)')?.textContent==='正在加载…'");
        await c.click(win,'.source-loading .preview-cancel-load');
        await c.check(win,'cancel retains already displayed records',"!document.querySelector('.source-loading')&&document.querySelector('[data-source-row]')?.dataset.sourceRow==='1000'");
        await c.click(win,'.source-footer button','下一段');
        await c.check(win,'reading resumes after cancelling scan',"Number(document.querySelector('[data-source-row]')?.dataset.sourceRow)>1000&&!document.querySelector('.source-loading')");
      }
      if(name==='xlsx')await c.check(win,'large XLSX displays source values',"document.querySelector('.source-table').textContent.includes('87.5')||document.querySelector('.source-table').textContent.includes('0.875')");
      if(name==='docx'||name==='pptx')await c.check(win,'large Office has extracted readable text',"document.querySelector('.source-document')?.textContent.trim().length>10");
      if(name==='pdf')await c.check(win,'range PDF draws actual page',"[...document.querySelectorAll('.pdf-page canvas')].some(c=>c.width>100&&c.height>100)");
      if(name==='image')await c.check(win,'large bitmap is reduced with real pixels',"(()=>{const c=document.querySelector('.large-image-preview canvas');if(!c||c.width*c.height>6000000)return false;const p=c.getContext('2d').getImageData(10,10,1,1).data;return p[2]>p[0]&&p[3]>0})()");
      if(name==='txt'){
        const id=await c.evaluate<string>(win,"document.querySelector('.preview-tab').dataset.fileId"),token='source-security-local-test';
        await c.evaluate(win,`window.localPreview.openFileSource(${JSON.stringify(id)},${JSON.stringify(token)})`);
        await c.check(c.home,'other window cannot read source token',`window.localPreview.readFileSource(${JSON.stringify(token)},{start:0}).then(()=>false,()=>true)`);
        await c.check(win,'record count budget rejects oversized request',`window.localPreview.readFileSource(${JSON.stringify(token)},{start:0,count:100000}).then(()=>false,()=>true)`);
        await c.evaluate(win,`window.localPreview.closeFileSource(${JSON.stringify(token)})`);
        win.unmaximize();win.setContentSize(720,520);win.webContents.setZoomFactor(1.25);
        await c.check(win,'source buttons have centered text',"[...document.querySelectorAll('.source-controls button')].every(b=>{const s=getComputedStyle(b);return s.alignItems==='center'&&s.justifyContent==='center'})");
        await c.snapshot(win,'source-text-small');
      }
      await c.snapshot(win,'source-'+name);
      assert.equal(await hash(file),before,'source SHA256 unchanged');
    }finally{clearInterval(sample);if(measurements.at(-1)?.name===name)measurements.at(-1)!.peakWorkingSetMiB=peakMemory;c.close(win);}
    for(let i=0;i<100&&c.program.previewResourceStats().sourceSessions;i++)await c.pause(50);
    const stats=c.program.previewResourceStats();assert.equal(stats.sourceSessions,0,name+' sessions released');assert.equal(stats.sourceHandles,0,name+' handles released');
  }
  assert.ok(c.program.previewResourceStats().sourceMaxRange<=1024*1024);
  assert.ok(c.program.previewResourceStats().sourcePeakReads<=8);
  c.pass('all large source SHA256, file handles, sessions and range/concurrency budgets verified');
  writeFileSync(`outputs/verification/source-measurements${c.formats?'-'+[...c.formats].join('-'):''}.json`,JSON.stringify({measurements,note:'Single synthetic run, warm filesystem cache. Sum of app process working sets sampled at 50 ms may double-count shared pages; includes lifecycle actions. Office packages and PDF include large unselected embedded content; not evidence for every complex document.'},null,2));
};
export default suite;
