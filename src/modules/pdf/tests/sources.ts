import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync} from 'node:fs';
import {open} from 'node:fs/promises';
import type {Suite} from '../../../../tests/context';

async function rangeFixture(file:string){
  if(existsSync(file))return;
  const handle=await open(file,'w'),offsets:number[]=[];let offset=0;
  const write=async(value:string|Buffer)=>{const bytes=Buffer.from(value);await handle.write(bytes);offset+=bytes.length;};
  try{
    await write('%PDF-1.4\n');
    const objects=['<< /Type /Catalog /Pages 2 0 R /Outlines 13 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R] /Count 4 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    for(let i=0;i<4;i++){const text=i===3?'Range PDF final needle':`Range PDF page ${i+1}`,stream=`BT /F1 20 Tf 40 1400 Td (${text}) Tj ET`;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 1800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    }
    for(const [i,object] of objects.entries()){offsets.push(offset);await write(`${i+1} 0 obj\n${object}\nendobj\n`);}
    offsets.push(offset);await write(`12 0 obj\n<< /Type /EmbeddedFile /Length ${24*1024*1024} >>\nstream\n`);
    const padding=Buffer.alloc(1024*1024,32);for(let i=0;i<24;i++)await write(padding);await write('\nendstream\nendobj\n');
    for(const [i,object] of ['<< /Type /Outlines /First 14 0 R /Last 14 0 R /Count 1 >>','<< /Title (Range PDF final needle) /Parent 13 0 R /Dest [10 0 R /FitH 1450] >>'].entries()){offsets.push(offset);await write(`${i+13} 0 obj\n${object}\nendobj\n`);}
    const xref=offset;await write(`xref\n0 15\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 15 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  }finally{await handle.close();}
}
const hash=async(file:string)=>{const value=createHash('sha256');for await(const data of createReadStream(file))value.update(data);return value.digest('hex');};
const suite:Suite=async c=>{
  const name='pdf-range-lifecycle-v1.pdf',file=c.fixture(name);await rangeFixture(file);const before=await hash(file),initial=c.program.previewResourceStats();
  const win=await c.open(name);let target:typeof win|undefined;
  try{
    win.unmaximize();win.setSize(1000,700);
    await c.check(win,'file-backed PDF draws real nonwhite page pixels',"(()=>{const canvas=document.querySelector('.pdf-page canvas');if(!canvas||canvas.width<100)return false;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<pixels.length;i+=16)if(pixels[i]<120&&pixels[i+3]>200)return true;return false})()");
    const ready=c.program.previewResourceStats();assert.ok(ready.sourceBytesRead-initial.sourceBytesRead<16*1024*1024,'first viewport must not read all 24 MiB of the source');assert.ok(ready.sourceSessions>initial.sourceSessions);assert.ok(ready.sourceMaxRange<=1024*1024);
    c.pass('large PDF uses bounded range reads rather than loading its attachment');
    await c.check(win,'file-backed PDF hides the unsupported print entry',"!document.querySelector('.pdf-print-button')");
    const id=await c.evaluate<string>(win,"document.querySelector('.preview-tab').dataset.fileId"),token='pdf-audit-range-owner-token';
    await c.evaluate(win,`window.localPreview.openFileSource(${JSON.stringify(id)},${JSON.stringify(token)})`);
    try{
      await c.check(win,'owner can read the PDF header',`window.localPreview.readFileRange('${token}',0,8).then(bytes=>new TextDecoder().decode(bytes).startsWith('%PDF'))`);
      await c.check(c.home,'another window cannot read the PDF range token',`window.localPreview.readFileRange('${token}',0,8).then(()=>false,()=>true)`);
      for(const [offset,length] of [[-1,8],[0,2*1024*1024],[Number.MAX_SAFE_INTEGER,8]])await c.check(win,'invalid PDF range rejected '+offset+':'+length,`window.localPreview.readFileRange('${token}',${offset},${length}).then(()=>false,()=>true)`);
    }finally{await c.evaluate(win,`window.localPreview.closeFileSource('${token}')`);}
    await c.click(win,'.pdf-nav-toggle');await c.check(win,'range PDF outline loads',"document.querySelectorAll('.outline-item').length===1");await c.click(win,'.outline-item');
    await c.check(win,'range PDF outline reaches its last-page heading',"document.querySelector('.page-nav input').value==='4'&&document.querySelector('.outline-item.current')?.title==='Range PDF final needle'");
    await c.click(win,'.pdf-search-toggle');await c.evaluate(win,"(()=>{const input=document.querySelector('.pdf-search-input');input.value='final needle';input.dispatchEvent(new Event('input',{bubbles:true}));})()");await c.click(win,'.pdf-search-go');
    await c.check(win,'range PDF search maps its match to the final page',"document.querySelector('.page-nav input').value==='4'&&document.querySelector('.pdf-page[data-page=\"3\"] .pdf-hit')?.textContent==='final needle'");
    await c.click(win,'.pdf-search-toggle');await c.click(win,'.pdf-rotate');
    await c.check(win,'range PDF rotation rebuilds its text layer',"document.querySelector('.pdf-rotate').title.includes('90°')&&!!document.querySelector('.pdf-page[data-page=\"3\"] .pdf-text-layer[data-built=\"1\"] span')");
    target=await c.open('document.pdf');
    await c.evaluate(target,`(()=>{const data=new DataTransfer();data.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));})()`);
    await c.check(target,'range PDF transfer restores page and rotation with a new owner',`(()=>{const tab=document.querySelector('[data-file-id="${id}"]');return tab&&getComputedStyle(tab).display!=='none'&&tab.querySelector('.page-nav input')?.value==='4'&&tab.querySelector('.pdf-rotate').title.includes('90°')&&tab.querySelector('.pdf-page[data-page="3"] canvas')?.width>0})()`);
    target.webContents.reload();await c.pause(200);
    await c.check(target,'renderer reload releases the one-time preview and requests reopening',"document.body.textContent.includes('预览已释放，请重新打开文件')&&!document.querySelector('.pdf-pane,.loading')");
  }finally{
    if(!win.isDestroyed())c.close(win);if(target&&!target.isDestroyed())c.close(target);
    for(let i=0;i<100&&(c.program.previewResourceStats().sourceSessions||c.program.previewResourceStats().sourceHandles);i++)await c.pause(50);
  }
  const end=c.program.previewResourceStats();assert.equal(end.sourceSessions,initial.sourceSessions);assert.equal(end.sourceHandles,initial.sourceHandles);assert.equal(end.sourceReads,0);assert.equal(await hash(file),before);
  c.pass('range PDF closes its sessions and handles and preserves its SHA256');
};
export default suite;
