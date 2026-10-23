import {evictInactivePreviews} from '../../../../tests/previewPressure';
import {dialog,nativeImage} from 'electron';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import type {Suite} from '../../../../tests/context';
import {outlineFixture} from './outlineFixture';
import {longFixture} from './longFixture';
function searchFixture(file:string){
  const content='BT /F1 12 Tf 40 240 Td (Local local HT-2026-1234 HT-2026-5678) Tj 0 -20 Td /F1 0.2 Tf ('+'a'.repeat(2000)+'!) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=objects.map((object,i)=>{const offset=Buffer.byteLength(pdf);pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;return offset;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;writeFileSync(file,pdf);
}
const suite:Suite=async c=>{
  const key=async(win:import('electron').BrowserWindow,value:string,extra='')=>c.evaluate(win,`document.querySelector('.pdf-scroll').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true,cancelable:true,${extra}}))`);
  const win=await c.open('document.pdf');
  await c.check(win,'PDF enhancement text layer ready',"!!document.querySelector('.pdf-text-layer[data-built] span[data-text-start]')");
  await key(win,' ','code:\'Space\'');
  await c.check(win,'Space grab cursor covers selectable text',"getComputedStyle(document.querySelector('.pdf-text-layer span')).cursor==='grab'");
  await c.evaluate(win,"window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',bubbles:true}))");
  await key(win,'End');await c.check(win,'End locates last PDF page',"document.querySelector('.page-nav input').value==='2'");
  await key(win,'Home');await c.check(win,'Home locates first PDF page',"document.querySelector('.page-nav input').value==='1'");
  await key(win,'=', 'ctrlKey:true');await c.check(win,'Ctrl plus updates preview zoom',"document.querySelector('.zoom-control input').value==='110'");
  await key(win,'-', 'ctrlKey:true');await c.check(win,'Ctrl minus updates preview zoom',"document.querySelector('.zoom-control input').value==='100'");
  await c.evaluate(win,"document.querySelector('.pdf-scroll').dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-100,bubbles:true,cancelable:true}))");
  await c.check(win,'explicit Ctrl wheel zooms PDF',"document.querySelector('.zoom-control input').value==='110'");
  await key(win,'0','ctrlKey:true');await key(win,'r');
  await c.check(win,'R rotates PDF clockwise',"document.querySelector('.pdf-rotate').title.includes('90°')");
  await key(win,'R','shiftKey:true');await c.check(win,'Shift R rotates PDF counterclockwise',"document.querySelector('.pdf-rotate').title.includes('0°')");
  await c.evaluate(win,"(()=>{const input=document.querySelector('.zoom-control input');input.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))})()");
  await c.check(win,'editing inputs does not trigger PDF shortcuts',"document.querySelector('.page-nav input').value==='1'");
  await c.click(win,'.pdf-present');
  await c.check(win,'presentation shows one proportional page on black stage',"(()=>{const root=document.querySelector('.pdf-scroll'),page=root.querySelector('.pdf-page');return document.documentElement.classList.contains('pdf-presentation-active')&&root.querySelectorAll('.pdf-page').length===1&&getComputedStyle(root).backgroundColor==='rgb(0, 0, 0)'&&page.clientWidth<=root.clientWidth&&page.clientHeight<=root.clientHeight&&getComputedStyle(document.querySelector('.page-nav')).display==='none'})()");
  if(!win.isFullScreen())throw Error('Presentation must enter native fullscreen');
  await key(win,'ArrowRight');await c.check(win,'presentation arrow advances a single page',"document.querySelector('.pdf-page').dataset.page==='1'&&document.querySelectorAll('.pdf-page').length===1");
  await c.evaluate(win,"document.querySelector('.pdf-scroll').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))");
  await c.check(win,'presentation right click goes back',"document.querySelector('.pdf-page').dataset.page==='0'");
  await key(win,' ');await c.check(win,'presentation Space advances without panning',"document.querySelector('.pdf-page').dataset.page==='1'&&!document.querySelector('.pan-ready')");
  await key(win,'Escape');await c.check(win,'presentation exit restores reader and zoom',"!document.querySelector('.pdf-presentation')&&document.querySelector('.zoom-control input').value==='100'");
  await c.pause(200);if(win.isFullScreen())throw Error('Presentation exit must restore native window');
  win.show();win.focus();await c.pause(120);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'P',modifiers:['control','shift']});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'P',modifiers:['control','shift']});
  await c.check(win,'native Ctrl Shift P reaches presentation shortcut',"!!document.querySelector('.pdf-presentation')");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await c.check(win,'native Escape exits presentation via fullscreen notification',"!document.querySelector('.pdf-presentation')");
  c.close(win);

  const tabs=(await c.program.openPaths([c.fixture('document.pdf'),c.fixture('text.txt')],'tabs'))[0];
  await c.check(tabs,'rotation session ready',"!!document.querySelector('.pdf-rotate')");
  await c.click(tabs,'.pdf-rotate');
  await c.click(tabs,'.tab .tab-name','text.txt');await evictInactivePreviews(c,tabs);
  await c.click(tabs,'.tab .tab-name','document.pdf');
  try{
  await c.check(tabs,'rotation survives pressure eviction and restore',"document.querySelector('.pdf-rotate').title.includes('90°')&&(()=>{const page=document.querySelector('.pdf-page');const canvas=page?.querySelector('canvas');return canvas?.height>canvas?.width&&!!page.querySelector('.pdf-text-layer[data-built] span')})()");
  }catch(error){throw Error(String(error)+' '+JSON.stringify(await c.evaluate(tabs,"[...document.querySelectorAll('.pdf-page')].map(p=>({style:p.getAttribute('style'),canvas:[p.querySelector('canvas').width,p.querySelector('canvas').height],text:p.querySelector('.pdf-text-layer').dataset,tab:p.closest('.preview-tab').getAttribute('style')}))")));}
  const id=await c.evaluate<string>(tabs,"document.querySelector('.preview-tab').dataset.fileId");
  const target=await c.open('text.txt');
  await c.evaluate(target,`(()=>{const data=new DataTransfer();data.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}))})()`);
  await c.check(target,'rotation survives cross-window transfer',"!!document.querySelector('.pdf-rotate')&&document.querySelector('.pdf-rotate').title.includes('90°')");
  c.close(tabs);c.close(target);

  outlineFixture(c.fixture('enhancement-outline.pdf'));
  const outline=await c.open('enhancement-outline.pdf');await c.click(outline,'.pdf-nav-toggle');
  await c.check(outline,'outline destination page numbers are visible',"document.querySelector('.outline-page')?.textContent==='1'");
  await c.evaluate(outline,"(()=>{const input=document.querySelector('[aria-label=搜索目录]');input.value='Section Two';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await c.check(outline,'outline filter selects matching chapter',"document.querySelectorAll('.outline-row').length===1&&document.querySelector('.outline-row').textContent.includes('Section Two')");
  await c.click(outline,'.outline-item');await c.check(outline,'filtered outline navigates to destination',"document.querySelector('.page-nav input').value==='3'");
  await c.evaluate(outline,"(()=>{const input=document.querySelector('[aria-label=搜索目录]');input.value='missing';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await c.check(outline,'outline filter has meaningful empty state',"document.querySelector('.pdf-outline').textContent.includes('没有匹配的章节')");
  c.close(outline);
  const scan=await c.open('enhancement-outline.pdf');await c.click(scan,'.pdf-search-toggle');
  await c.evaluate(scan,"(()=>{const i=document.querySelector('.pdf-search-input');i.value='scan';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await c.click(scan,'.pdf-search-go');
  await c.check(scan,'no-text PDF explains scanning search limitation',"document.querySelector('.pdf-search-notice')?.textContent.includes('未包含可提取文字层')");c.close(scan);

  searchFixture(c.fixture('enhancement-search.pdf'));
  const search=await c.open('enhancement-search.pdf');await c.click(search,'.pdf-search-toggle');
  const query=async(value:string)=>{await c.check(search,'search controls ready for '+value,"!!document.querySelector('.pdf-search-go:not(:disabled)')");await c.evaluate(search,`(()=>{const i=document.querySelector('.pdf-search-input');i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await c.click(search,'.pdf-search-go');};
  await query('Local');await c.check(search,'case-insensitive search finds both cases',"document.querySelector('.pdf-search-count').textContent.includes('1 / 2')");
  await c.click(search,'.pdf-search-case');await c.check(search,'case-sensitive search filters cases',"document.querySelector('.pdf-search-count').textContent.includes('1 / 1')");
  await c.evaluate(search,"(()=>{const mode=document.querySelector('.pdf-search-mode');mode.value='wildcard';mode.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await query('HT-2026-????');await c.check(search,'wildcard worker finds structured identifiers',"document.querySelector('.pdf-search-count').textContent.includes('1 / 2')&&document.querySelector('.pdf-hit')?.textContent==='HT-2026-1234'");
  await c.evaluate(search,"(()=>{const mode=document.querySelector('.pdf-search-mode');mode.value='regex';mode.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await query('HT-2026-[0-9]{4}');await c.check(search,'regex worker maps match to DOM text',"document.querySelector('.pdf-search-count').textContent.includes('1 / 2')&&document.querySelector('.pdf-hit')?.textContent==='HT-2026-1234'");
  await query('[');await c.check(search,'invalid regex gives recoverable error',"!!document.querySelector('.pdf-search-error')");
  await query('(a+)+$');await c.check(search,'expensive regex terminates at deadline',"document.querySelector('.pdf-search-error')?.textContent.includes('超时')");
  await query('Local');await c.check(search,'search recovers after regex timeout',"document.querySelector('.pdf-search-count').textContent.includes('1 / 1')");
  c.close(search);

  const notes=await c.open('document.pdf');await c.check(notes,'export selection ready',"!!document.querySelector('.pdf-text-layer span')");
  await c.evaluate(notes,"(()=>{const span=document.querySelector('.pdf-text-layer span'),range=document.createRange();range.selectNodeContents(span);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.querySelector('.pdf-scroll').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))})()");
  await c.click(notes,'.pdf-mark-note');await c.check(notes,'note export enabled for current page',"!document.querySelector('.pdf-export-notes').disabled");
  await c.evaluate(notes,"(()=>{const i=document.querySelector('.pdf-note textarea');i.value='Export note content';i.dispatchEvent(new Event('input',{bubbles:true}))})()");
  const save=dialog.showSaveDialog;const output=path.resolve('outputs/verification/annotated-page.png');
  try{
    dialog.showSaveDialog=(async()=>({canceled:true,filePath:''})) as typeof save;
    await c.click(notes,'.pdf-export-notes');await c.check(notes,'cancelled save does not report export success',"document.querySelector('.pdf-export-status').textContent.includes('已取消')");
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:output})) as typeof save;
    await c.click(notes,'.pdf-export-notes');await c.check(notes,'explicit annotation PNG save succeeds',"document.querySelector('.pdf-export-status').textContent.includes('已保存')");
    if(!existsSync(output))throw Error('PNG not saved');const image=nativeImage.createFromBuffer(readFileSync(output)),size=image.getSize();if(image.isEmpty()||size.width*size.height>6000000)throw Error('Invalid annotated PNG');
    c.pass('annotation export is a bounded valid PNG');
    const imageSource=await c.open('image.png');
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:c.fixture('image.png')})) as typeof save;
    await c.click(notes,'.pdf-export-notes');await c.check(notes,'export cannot overwrite another open image source',"document.querySelector('.pdf-export-status').textContent.includes('不能覆盖')");c.close(imageSource);
    dialog.showSaveDialog=(async()=>({canceled:false,filePath:c.fixture('document.pdf')})) as typeof save;
    await c.click(notes,'.pdf-export-notes');await c.check(notes,'export rejects source path and non-PNG target',"document.querySelector('.pdf-export-status').textContent.includes('不能覆盖')");
  }finally{dialog.showSaveDialog=save;c.close(notes);}
  longFixture(c.fixture('enhancement-long.pdf'),160);
  const long=await c.open('enhancement-long.pdf');await c.check(long,'preheated long document remains virtualized',"Number(document.querySelector('.page-nav input').max)===160&&document.querySelectorAll('.pdf-page').length<20");c.close(long);
};
export default suite;
