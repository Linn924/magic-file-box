import {writeFileSync} from 'node:fs';
import type {Suite} from '../../../../tests/context';
import {linkFixture} from './linkFixture';
export function spreadFixture(file:string,count=81,mixed=false){
  const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:count},(_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${count} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for(let i=0;i<count;i++){
    const width=mixed&&i%4===2?800:400,height=mixed&&i%4===2?300:600;
    const text=`BT /F1 20 Tf 40 ${height-70} Td (Needle page ${i+1} END) Tj ET 0.2 0.4 0.8 rg 40 40 80 80 re f`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  }
  let pdf='%PDF-1.4\n';const offsets=objects.map((object,i)=>{const offset=Buffer.byteLength(pdf);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;return offset;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;writeFileSync(file,pdf);
}
const suite:Suite=async c=>{
  const zoom=async(win:import('electron').BrowserWindow,value:number)=>{await c.evaluate(win,`(()=>{const i=document.querySelector('.zoom-control input');i.value='${value}';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))})()`);await c.pause(220);};
  const jump=async(win:import('electron').BrowserWindow,page:number)=>c.evaluate(win,`(()=>{const i=document.querySelector('.page-nav input');i.value='${page}';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const paired="(()=>{const row=[...document.querySelectorAll('.pdf-row')].find(r=>r.dataset.pages==='3,4');if(!row)return false;const pages=row.querySelectorAll('.pdf-page'),a=pages[0].getBoundingClientRect(),b=pages[1].getBoundingClientRect(),root=document.querySelector('.pdf-scroll').getBoundingClientRect();return Math.abs(a.top-b.top)<1&&b.left>=a.right+23&&row.getBoundingClientRect().width<=root.width-52&&[...pages].every(p=>p.querySelector('canvas').width>0)})()";
  spreadFixture(c.fixture('spread-reading.pdf'));
  const win=await c.open('spread-reading.pdf');win.unmaximize();win.setSize(1000,750);await c.pause(250);
  await zoom(win,100);await jump(win,4);
  await c.check(win,'100 percent begins with single-page rows',"document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.page-nav input').value==='4'");
  await zoom(win,50);await c.check(win,'toolbar zoom fits pages 3 and 4 side by side',paired);
  await c.check(win,'single to double retains right-page reading target',"document.querySelector('.page-nav input').value==='4'");
  for(let i=0;i<6;i++){
    if(await c.evaluate(win,"document.querySelector('.pdf-scroll').dataset.layout==='single'"))break;
    await c.evaluate(win,"document.querySelector('.pdf-scroll').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}))");await c.pause(180);
  }
  await c.check(win,'Ctrl wheel enlargement automatically restores single layout',"Number(document.querySelector('.zoom-control input').value)>50&&document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.page-nav input').value==='4'");
  for(let i=0;i<6;i++){
    if(await c.evaluate(win,"document.querySelector('.pdf-scroll').dataset.layout==='double'"))break;
    await c.evaluate(win,"document.querySelector('.pdf-scroll').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:100,bubbles:true,cancelable:true}))");await c.pause(180);
  }
  await c.check(win,'Ctrl wheel shrink automatically returns to double layout',paired);
  await zoom(win,50);
  await c.evaluate(win,"document.querySelector('.pdf-scroll').dispatchEvent(new WheelEvent('wheel',{deltaY:20,bubbles:true,cancelable:true}))");await c.check(win,'ordinary content wheel leaves zoom unchanged',"document.querySelector('.zoom-control input').value==='50'");
  await jump(win,80);await c.check(win,'right page 80 lands in its physical pair',"document.querySelector('.page-nav input').value==='80'&&[...document.querySelectorAll('.pdf-row')].some(r=>r.dataset.pages==='79,80'&&[...r.querySelectorAll('canvas')].every(c=>c.width>0))");
  await jump(win,81);await c.check(win,'odd last page has no blank partner',"document.querySelector('.page-nav input').value==='81'&&document.querySelector('.pdf-page[data-page=\"80\"]')?.parentElement.dataset.pages==='81'");
  await c.check(win,'long double layout keeps DOM and bitmap pixels bounded',"document.querySelectorAll('.pdf-page').length<24&&Number(document.documentElement.dataset.pdfCanvasPixels)<=Number(document.documentElement.dataset.pdfCanvasBudget)&&[...document.querySelectorAll('.pdf-page canvas')].every(c=>c.width*c.height<=6000000)");
  await jump(win,4);await c.click(win,'.pdf-search-toggle');
  await c.evaluate(win,"(()=>{const i=document.querySelector('.pdf-search-input');i.value='Needle page 4 END';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await c.click(win,'.pdf-search-go');
  await c.check(win,'search locates text in right page without changing its page number',"document.querySelector('.page-nav input').value==='4'&&!!document.querySelector('.pdf-page[data-page=\"3\"] .pdf-hit')");await c.click(win,'.pdf-search-toggle');
  await c.evaluate(win,"(()=>{const span=document.querySelector('.pdf-page[data-page=\"3\"] .pdf-text-layer span');const range=document.createRange();range.selectNodeContents(span);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('.pdf-scroll').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})()");await c.click(win,'.pdf-mark-highlight');
  await c.evaluate(win,"(()=>{const left=document.querySelector('.pdf-page[data-page=\"2\"] .pdf-text-layer span').firstChild,right=document.querySelector('.pdf-page[data-page=\"3\"] .pdf-text-layer span').firstChild;const range=document.createRange();range.setStart(left,0);range.setEnd(right,right.textContent.length);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('.pdf-scroll').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})()");await c.check(win,'cross-page selection does not create a misplaced annotation',"!document.querySelector('.pdf-mark-highlight,.pdf-mark-note')");await c.evaluate(win,'getSelection().removeAllRanges()');
    await zoom(win,100);await c.check(win,'annotation survives layout change on original right page',"!!document.querySelector('.pdf-page[data-page=\"3\"] .pdf-user-mark.highlight')&&document.querySelector('.page-nav input').value==='4'");
  await zoom(win,50);await c.check(win,'annotation returns in same paired physical page',paired+"&&!!document.querySelector('.pdf-page[data-page=\"3\"] .pdf-user-mark.highlight')");
  await c.click(win,'.pdf-rotate');await c.check(win,'rotation reflows to single without losing current page',"document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.page-nav input').value==='4'");
  await c.click(win,'.pdf-rotate');await c.click(win,'.pdf-rotate');await c.click(win,'.pdf-rotate');await c.check(win,'full rotation cycle restores automatic double rows',paired);
  await zoom(win,70);win.setSize(720,750);await c.check(win,'narrow resize splits a pair automatically',"document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.page-nav input').value==='4'");win.setSize(1000,750);await c.check(win,'wider resize restores pairs',paired);
  await c.click(win,'.pdf-nav-toggle');await c.check(win,'navigation sidebar width automatically splits pair',"document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.page-nav input').value==='4'");await c.click(win,'.pdf-nav-toggle');await c.check(win,'closing sidebar restores fitting pair',paired);
  await c.evaluate(win,"(()=>{const fit=document.querySelector('[aria-label=页面适配]');fit.value='width';fit.dispatchEvent(new Event('change',{bubbles:true}))})()");await c.check(win,'fit width at 100 percent uses single pages',"document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.page-nav input').value==='4'");await zoom(win,40);await c.check(win,'fit width scaling below half permits pair',paired);
  await c.evaluate(win,"(()=>{const fit=document.querySelector('[aria-label=页面适配]');fit.value='page';fit.dispatchEvent(new Event('change',{bubbles:true}))})()");await c.check(win,'fit page respects height and keeps both pages visible',"(()=>{const root=document.querySelector('.pdf-scroll'),row=[...root.querySelectorAll('.pdf-row')].find(r=>r.dataset.pages==='3,4');return !!row&&parseFloat(row.style.height)<=root.clientHeight&&row.querySelectorAll('.pdf-page').length===2})()");
  await c.evaluate(win,"(()=>{const fit=document.querySelector('[aria-label=页面适配]');fit.value='original';fit.dispatchEvent(new Event('change',{bubbles:true}))})()");await zoom(win,50);await c.check(win,'reader returns to original scale pairing',paired);
    await c.click(win,'.pdf-present');await c.check(win,'presentation always uses one physical page',"document.querySelector('.pdf-presentation')&&document.querySelectorAll('.pdf-page').length===1&&document.querySelector('.pdf-scroll').dataset.layout==='single'&&document.querySelector('.pdf-page').dataset.page==='3'");
  await c.evaluate(win,"document.querySelector('.pdf-scroll').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");await c.pause(350);await c.check(win,'presentation exit restores double reading layout and right physical page',paired+"&&document.querySelector('.page-nav input').value==='4'");
  await c.snapshot(win,'pdf-double-reading');c.close(win);
  const tabs=(await c.program.openPaths([c.fixture('spread-reading.pdf'),c.fixture('text.txt')],'tabs'))[0];tabs.unmaximize();tabs.setSize(1000,750);await c.pause(250);await zoom(tabs,70);await jump(tabs,4);
  await c.check(tabs,'right-page session ready before tab unload',"document.querySelector('.page-nav input').value==='4'");await c.click(tabs,'.tab .tab-name','text.txt');await c.pause(2200);await c.click(tabs,'.tab .tab-name','spread-reading.pdf');
  await c.check(tabs,'tab unload restores physical right page and pair',"document.querySelector('.page-nav input').value==='4'&&!!document.querySelector('.pdf-row[data-pages=\"3,4\"]')");
  const id=await c.evaluate<string>(tabs,"[...document.querySelectorAll('.preview-tab')].find(t=>t.dataset.fileId&&getComputedStyle(t).display!=='none').dataset.fileId");
  const target=await c.open('text.txt');target.unmaximize();target.setSize(720,750);await c.pause(250);
  await c.evaluate(target,`(()=>{const d=new DataTransfer();d.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}))})()`);
  await c.check(target,'cross-window transfer restores right page in a new single layout',"document.querySelector('.page-nav input')?.value==='4'&&document.querySelector('.pdf-scroll')?.dataset.layout==='single'");c.close(tabs);c.close(target);
    spreadFixture(c.fixture('spread-mixed.pdf'),9,true);const mixed=await c.open('spread-mixed.pdf');mixed.unmaximize();mixed.setSize(1000,750);await c.pause(250);await zoom(mixed,65);
  await c.check(mixed,'mixed page sizes fit or split each fixed pair independently',"document.querySelector('.pdf-scroll').dataset.layout==='mixed'&&!!document.querySelector('.pdf-row[data-pages=\"1,2\"]')&&!!document.querySelector('.pdf-row[data-pages=\"3\"]')");
  await jump(mixed,4);await c.check(mixed,'mixed rows locate unpaired page four accurately',"(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page[data-page=\"3\"]');return document.querySelector('.page-nav input').value==='4'&&page&&Math.abs(page.getBoundingClientRect().top-root.getBoundingClientRect().top-26)<50})()");c.close(mixed);
  spreadFixture(c.fixture('spread-short-tail.pdf'),3,true);const short=await c.open('spread-short-tail.pdf');short.unmaximize();short.setSize(1000,750);await c.pause(250);await zoom(short,50);await jump(short,3);await c.pause(200);
  await c.check(short,'short last page retains requested page despite scroll clamping',"(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page[data-page=\"2\"]');return document.querySelector('.page-nav input').value==='3'&&page?.querySelector('canvas').width>0&&page.getBoundingClientRect().top<root.getBoundingClientRect().bottom})()");c.close(short);
    spreadFixture(c.fixture('spread-single.pdf'),1);const single=await c.open('spread-single.pdf');await zoom(single,25);await c.check(single,'one-page document never fabricates a second page',"document.querySelectorAll('.pdf-page').length===1&&document.querySelector('.pdf-scroll').dataset.layout==='single'");c.close(single);
  linkFixture(c.fixture('spread-links.pdf'));const link=await c.open('spread-links.pdf');link.unmaximize();link.setSize(1000,750);await c.pause(250);await zoom(link,50);await c.check(link,'linked pair is selectable and rendered',"!!document.querySelector('.pdf-row[data-pages=\"1,2\"] .pdf-annot-layer a')");await c.click(link,'.pdf-annot-layer a');await c.check(link,'internal link targets right physical page in same row',"document.querySelector('.page-nav input').value==='2'");c.close(link);
};
export default suite;
