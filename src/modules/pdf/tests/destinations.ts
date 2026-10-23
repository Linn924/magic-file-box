import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import type {Suite,TestContext} from '../../../../tests/context';
function fixture(file:string){
  const content='0.8 0.1 0.1 rg 40 1490 180 20 re f 0.1 0.6 0.2 rg 40 890 180 20 re f 0.1 0.2 0.8 rg 40 290 180 20 re f';
  const objects=['<< /Type /Catalog /Pages 2 0 R /Outlines 7 0 R /Names << /Dests << /Names [(low-section) [4 0 R /XYZ 40 300 null]] >> >> >>','<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',...Array.from({length:3},()=> '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 1800] /Resources << >> /Contents 6 0 R >>'),`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Outlines /First 8 0 R /Last 10 0 R /Count 3 >>','<< /Title (Same page upper) /Parent 7 0 R /Next 9 0 R /Dest [4 0 R /XYZ 40 1500 null] >>','<< /Title (Same page middle) /Parent 7 0 R /Prev 8 0 R /Next 10 0 R /Dest [4 0 R /FitH 900] >>','<< /Title (Same page lower named) /Parent 7 0 R /Prev 9 0 R /Dest (low-section) >>'];
  let pdf='%PDF-1.4\n';const offsets=objects.map((object,i)=>{const offset=Buffer.byteLength(pdf);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;return offset;});const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;writeFileSync(file,pdf);
}
const suite:Suite=async c=>{
  const name='precise-directory-v1.pdf';if(!existsSync(c.fixture(name)))fixture(c.fixture(name));const original=readFileSync(c.fixture(name)),win=await c.open(name);
  try{
    win.unmaximize();win.setSize(1000,650);await c.click(win,'.pdf-nav-toggle');
    await c.check(win,'coordinate directory is loaded',"document.querySelectorAll('.outline-item').length===3");
    const setZoom=async(value:number)=>{await c.evaluate(win,`(()=>{const e=document.querySelector('.zoom-control input');e.value='${value}';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    for(const zoom of [100,150,40]){
      await setZoom(zoom);
      for(const [index,y] of [1500,900,300].entries()){
        await c.click(win,`.outline-row:nth-of-type(${index+1}) .outline-item`).catch(async()=>{await c.evaluate(win,`document.querySelectorAll('.outline-item')[${index}].click()`);});
        await c.check(win,`directory jumps to exact same-page section ${index+1} at ${zoom}%`,`(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page[data-page="1"]');if(!page)return false;const r=page.getBoundingClientRect(),v=root.getBoundingClientRect();return document.querySelector('.page-nav input').value==='2'&&Math.abs(r.top+(1800-${y})*r.height/1800-v.top-24)<2&&document.querySelectorAll('.outline-item')[${index}].classList.contains('current')})()`);
      }
    }
    await setZoom(100);await c.evaluate(win,"document.querySelectorAll('.outline-item')[0].click()");
    for(const [index,y] of [1400,800,200].entries()){
      await c.evaluate(win,`(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page[data-page="1"]'),r=page.getBoundingClientRect(),v=root.getBoundingClientRect();root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));root.scrollTop+=r.top+(1800-${y})*r.height/1800-v.top-24;root.dispatchEvent(new Event('scroll'));})()`);
      await c.check(win,`body scrolling selects the correct section within page 2 (${index+1})`,`document.querySelectorAll('.outline-item')[${index}].classList.contains('current')`);
    }
    await c.click(win,'.pdf-rotate');await setZoom(150);
    for(const index of [0,2,1]){
      await c.evaluate(win,`document.querySelectorAll('.outline-item')[${index}].click()`);
      const y=[1500,900,300][index];
      await c.check(win,'rotated destination is visible and selects the clicked chapter',`(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page[data-page="1"]');if(!page)return false;const r=page.getBoundingClientRect(),v=root.getBoundingClientRect(),x=r.left+${y}/1800*r.width;return x>=v.left-1&&x<=v.right+1&&document.querySelectorAll('.outline-item')[${index}].classList.contains('current')})()`);
    }
    await c.snapshot(win,'pdf-precise-directory');assert.deepEqual(readFileSync(c.fixture(name)),original);c.pass('precise navigation preserves the PDF source bytes');
  }finally{c.close(win);}
  await impreciseBookmarks(c);
};
export default suite;

function titleFixture(file:string){
  const streams=['BT /F1 20 Tf 40 1500 Td (First page) Tj ET',
    'BT /F1 20 Tf 40 1250 Td (4.1) Tj 40 0 Td (Past markup) Tj ET BT /F1 20 Tf 40 700 Td (4.1.1) Tj 70 0 Td (Procedural: automation 100%, control 0%) Tj ET',
    'BT /F1 20 Tf 40 1000 Td (4.1.2) Tj 70 0 Td (Static: automation 0%, control 100%) Tj ET',
    'BT /F1 20 Tf 40 1500 Td (Last page) Tj ET'];
  const objects=['<< /Type /Catalog /Pages 2 0 R /Outlines 12 0 R >>','<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R] /Count 4 >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  streams.forEach((stream,i)=>objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 1800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
  objects.push('<< /Type /Outlines /First 13 0 R /Last 13 0 R /Count 3 >>','<< /Title (4.1 Past markup) /Parent 12 0 R /First 14 0 R /Last 15 0 R /Count 2 /Dest [6 0 R /FitH 1290] >>','<< /Title (4.1.1 Procedural: automation 100%, control 0%) /Parent 13 0 R /Next 15 0 R /Dest [6 0 R /FitH 1290] >>','<< /Title (4.1.2 Static: automation 0%, control 100%) /Parent 13 0 R /Prev 14 0 R /Dest [8 0 R /FitH 1100] >>');
  let pdf='%PDF-1.4\n';const offsets=objects.map((object,i)=>{const at=Buffer.byteLength(pdf);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;return at;}),xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;writeFileSync(file,pdf);
}
async function impreciseBookmarks(c:TestContext){
  const name='imprecise-bookmarks-v1.pdf';if(!existsSync(c.fixture(name)))titleFixture(c.fixture(name));
  const original=readFileSync(c.fixture(name)),win=await c.open(name);
  const aligned=(heading:string,page:number,index:number)=>`(()=>{const root=document.querySelector('.pdf-scroll'),span=[...root.querySelectorAll('.pdf-page[data-page="${page-1}"] .pdf-text-layer span')].find(span=>span.textContent==='${heading}');return span&&Math.abs(span.getBoundingClientRect().top-root.getBoundingClientRect().top-24)<2&&document.querySelectorAll('.outline-item')[${index}].classList.contains('current')})()`;
  try{
    win.unmaximize();win.setSize(1000,650);await c.click(win,'.pdf-nav-toggle');
    await c.check(win,'imprecise parent and child bookmarks are loaded',"document.querySelectorAll('.outline-item').length===3");
    for(const zoom of [100,150,40]){
      await c.evaluate(win,`(()=>{const input=document.querySelector('.zoom-control input');input.value='${zoom}';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      for(const [index,heading,page] of [[1,'4.1.1',2],[0,'4.1',2],[2,'4.1.2',3]] as const){
        await c.evaluate(win,`document.querySelectorAll('.outline-item')[${index}].click()`);
        await c.check(win,`full heading ${heading} reaches the viewport top at ${zoom}% despite an imprecise bookmark`,aligned(heading,page,index));
      }
    }
    const shrunkHeight=await c.evaluate<number>(win,"parseFloat(document.querySelector('.pdf-page').style.height)");
    await c.evaluate(win,"(()=>{const input=document.querySelector('.zoom-control input');input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await c.check(win,'normal page geometry is committed before consecutive directory clicks',`document.querySelector('.pdf-scroll').dataset.layout==='single'&&Math.abs(parseFloat(document.querySelector('.pdf-page').style.height)-${shrunkHeight}*2.5)<.1`);
    await c.evaluate(win,"document.querySelectorAll('.outline-item')[0].click();document.querySelectorAll('.outline-item')[1].click();");
    await c.check(win,'latest child selection wins over the preceding parent navigation',aligned('4.1.1',2,1));
    await c.snapshot(win,'pdf-corrected-bookmark-title');
    await c.evaluate(win,"(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page[data-page=\"1\"]'),span=[...page.querySelectorAll('.pdf-text-layer span')].find(span=>span.textContent==='4.1'),view=root.getBoundingClientRect();root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));root.scrollTop+=span.getBoundingClientRect().top-view.top-20;root.dispatchEvent(new Event('scroll'));})()");
    await c.check(win,'scrolling back selects the parent using its corrected title position',"document.querySelectorAll('.outline-item')[0].classList.contains('current')");
    assert.deepEqual(readFileSync(c.fixture(name)),original);c.pass('imprecise bookmark correction preserves source bytes');
  }finally{c.close(win);}
}
