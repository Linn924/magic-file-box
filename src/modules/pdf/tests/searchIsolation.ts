import assert from 'node:assert/strict';
import {existsSync,createReadStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Suite} from '../../../../tests/context';
import {searchRangeTest as driver,releaseSearchRanges} from '../../../../tests/pdfSearchDriver';
import {encryptedFixture} from './encryptedFixture';

const SIZE=6*1024*1024,COUNT=24;
async function fixture(file:string){
 if(existsSync(file))return;
 const handle=await open(file,'w'),offsets:number[]=[];let at=0;
 const write=async(value:string|Buffer)=>{const bytes=Buffer.from(value);await handle.write(bytes);at+=bytes.length;};
 const object=async(id:number,value:string)=>{offsets[id-1]=at;await write(`${id} 0 obj\n${value}\nendobj\n`);};
 try{
  await write('%PDF-1.4\n');
  await object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  await object(2,`<< /Type /Pages /Kids [${Array.from({length:COUNT},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${COUNT} >>`);
  await object(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const padding=Buffer.alloc(SIZE,32);padding[0]=37;padding[padding.length-1]=10;
  for(let i=0;i<COUNT;i++){
   const text=`BT /F1 20 Tf 40 500 Td (needle page ${i+1}) Tj ET\n`;
   await object(4+i*2,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
   offsets[4+i*2]=at;await write(`${5+i*2} 0 obj\n<< /Length ${SIZE+text.length} >>\nstream\n`);await write(padding);await write(text);await write('endstream\nendobj\n');
  }
  const xref=at;await write(`xref\n0 ${offsets.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${offsets.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 }finally{await handle.close();}
}
const hash=async(file:string)=>{const result=createHash('sha256');for await(const bytes of createReadStream(file))result.update(bytes);return result.digest('hex');};
const suite:Suite=async c=>{
 const name='pdf-isolated-search-144m-v1.pdf',file=c.fixture(name);await fixture(file);const before=await hash(file),initial=c.program.previewResourceStats();
 let win=await c.open(name);
 const query=async(value:string)=>{await c.evaluate(win,`(()=>{const i=document.querySelector('.pdf-search-input');i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await c.click(win,'.pdf-search-go');};
 const readable="!!document.querySelector('.pdf-pane')&&!document.querySelector('.preview-body>.error')&&document.querySelector('.pdf-page canvas')?.width>0";
 const observeWorkers=()=>c.evaluate(win,"(()=>{window.searchWorkers=new Set();window.searchWorkerStarts=0;const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);window.searchWorkerStarts++;window.searchWorkers.add(this)}terminate(){window.searchWorkers.delete(this);super.terminate()}}})()");
 try{
  await c.click(win,'.pdf-search-toggle');
  await observeWorkers();
  driver.enabled=true;driver.tokens.clear();driver.opens=0;driver.start=Infinity;driver.end=Infinity;
  const readBefore=c.program.previewResourceStats().sourceBytesRead;
  await query('needle');
  await c.check(win,'batched search scans more than the old 128 MiB lifetime limit',"document.querySelector('.pdf-search-count').textContent.includes('1 / 24')&&!document.querySelector('.pdf-search-error')");
  assert.ok(c.program.previewResourceStats().sourceBytesRead-readBefore>128*1024*1024);assert.ok(driver.opens>=4,'search must recreate its parser and source between batches');
  await c.check(win,'completed search terminates every independently owned worker',"searchWorkerStarts>=4&&searchWorkers.size===0");
  await c.check(win,'completed large search preserves its reading document',readable);
  c.pass('real 144 MiB content search completes with independently released batches');
  driver.enabled=false;c.close(win);win=await c.open(name);driver.enabled=true;driver.tokens.clear();
  await observeWorkers();
  await c.click(win,'.pdf-search-toggle');
  driver.start=3*SIZE+1024*1024;driver.end=4*SIZE;driver.failures=0;
  await query('needle page');
  await c.check(win,'failed search retains partial results and explicitly labels incomplete search',"document.querySelector('.pdf-search-error')?.textContent.includes('已保留 3 处结果')&&document.querySelector('.pdf-search-count').textContent.includes('未完成')&&!!document.querySelector('.pdf-search-go:not(:disabled)')");
  assert.ok(driver.failures>0);await c.check(win,'range failure stays inside the search UI',readable);
  await c.check(win,'failed search terminates its blocked worker',"searchWorkers.size===0");
  await c.click(win,'.pdf-search-bar button[title=下一处]');
  await c.check(win,'partial search results still navigate and highlight',"document.querySelector('.page-nav input').value==='2'&&document.querySelector('.pdf-hit')?.textContent==='needle page'");
  driver.start=Infinity;driver.end=Infinity;
  await c.evaluate(win,"(()=>{const p=document.querySelector('.page-nav input');p.value='5';p.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await c.check(win,'normal reading continues on a new page after search failure',"document.querySelector('.page-nav input').value==='5'&&document.querySelector('.pdf-page[data-page=\"4\"] canvas')?.width>0&&!document.querySelector('.preview-body>.error')");
  await c.check(win,'new reading page still contains real text and painted pixels',"(()=>{const page=document.querySelector('.pdf-page[data-page=\"4\"]'),canvas=page?.querySelector('canvas');if(!canvas?.width||!page.querySelector('.pdf-text-layer')?.textContent.includes('needle page 5'))return false;const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<bytes.length;i+=4)if(bytes[i+3]>200&&bytes[i]<100&&bytes[i+1]<100&&bytes[i+2]<100)return true;return false})()");
  await c.snapshot(win,'pdf-search-partial-reading');
  await c.click(win,'.pdf-search-toggle');await c.click(win,'.pdf-search-toggle');
  driver.hold=true;driver.waiting=0;await query('cancelled needle');
  for(let i=0;i<100&&!driver.waiting;i++)await c.pause(25);assert.ok(driver.waiting);
  await c.click(win,'.pdf-search-bar button[title=清除搜索]');releaseSearchRanges();
  await c.check(win,'clearing a blocked search leaves no stale results',"document.querySelector('.pdf-search-input').value===''&&!document.querySelector('.pdf-search-error')&&document.querySelector('.pdf-search-count').textContent.includes('输入内容')");
  await c.check(win,'cancellation releases its independent worker',"searchWorkers.size===0");
  await query('page 1');await c.check(win,'a new search works after cancellation and failure',"document.querySelector('.pdf-search-count').textContent.includes('1 / 11')&&!document.querySelector('.pdf-search-error')");
  driver.enabled=false;c.close(win);win=await c.open(name);driver.enabled=true;driver.tokens.clear();await c.click(win,'.pdf-search-toggle');
  driver.hold=true;driver.waiting=0;await query('close pending search');
  for(let i=0;i<100&&!driver.waiting;i++)await c.pause(25);assert.ok(driver.waiting);
 }finally{releaseSearchRanges();driver.enabled=false;driver.start=Infinity;driver.end=Infinity;c.close(win);}
 for(let i=0;i<100&&c.program.previewResourceStats().sourceHandles>initial.sourceHandles;i++)await c.pause(50);
 assert.equal(c.program.previewResourceStats().sourceSessions,initial.sourceSessions);assert.equal(c.program.previewResourceStats().sourceHandles,initial.sourceHandles);assert.equal(c.program.previewResourceStats().sourceReads,0);assert.equal(await hash(file),before);
 c.pass('isolated search releases sources and handles and preserves original PDF bytes');
 const lockedName='pdf-search-password-v1.pdf';if(!existsSync(c.fixture(lockedName)))encryptedFixture(c.fixture(lockedName));
 const locked=await c.program.openPath(c.fixture(lockedName));
 try{
  await c.check(locked,'encrypted PDF waits for an explicit session password',"!!document.querySelector('.pdf-password input')");
  await c.evaluate(locked,"(()=>{const input=document.querySelector('.pdf-password input');input.value='secret';input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})()");
  await c.check(locked,'encrypted reading document unlocks normally',"!!document.querySelector('.pdf-search-toggle')&&!document.querySelector('.pdf-password')");
  await c.click(locked,'.pdf-search-toggle');
  await c.evaluate(locked,"(()=>{const input=document.querySelector('.pdf-search-input');input.value='Encrypted';input.dispatchEvent(new Event('input',{bubbles:true}))})()");await c.click(locked,'.pdf-search-go');
  await c.check(locked,'isolated search uses only the current in-memory PDF password',"document.querySelector('.pdf-search-count').textContent.includes('1 / 1')&&document.querySelector('.pdf-hit')?.textContent==='Encrypted'&&!document.querySelector('.pdf-search-error')");
 }finally{c.close(locked);}
};
export default suite;
