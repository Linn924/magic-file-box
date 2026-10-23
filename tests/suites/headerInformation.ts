import {existsSync,writeFileSync} from 'node:fs';
import type {Suite} from '../context';
import {evictInactivePreviews} from '../previewPressure';
const suite:Suite=async c=>{
  const name='header-information-long-config-fixture-v1.cjs';
  if(!existsSync(c.fixture(name)))writeFileSync(c.fixture(name),'module.exports = { singleQuote: true };\n');
  for(const [file,type] of [[name,'JavaScript'],['data.json','JSON'],['image.png','PNG'],['styled.xlsx','XLSX'],['document.pdf','PDF'],['document.docx','DOCX'],['presentation.pptx','PPTX']]){
    const win=await c.open(file);
    try{
      await c.check(win,file+' shows its format in the top file identity bar',`document.querySelector('.idbar .badge')?.innerText.trim()===${JSON.stringify(type)}`);
      if(file===name||file==='data.json')await c.check(win,'text statistics move to the identity bar with no bottom status bar',"!!document.querySelector('.idbar .text-counts')&&!document.querySelector('.text-footer,.text .pane-footer')&&document.querySelector('.idbar .text-counts').textContent.includes('行')");
      if(file==='image.png')await c.check(win,'image metadata and fit mode remain available at the top',"!!document.querySelector('.idbar .image-dimensions')&&!!document.querySelector('.idbar .image-fit-label')&&!document.querySelector('.image-pane .pane-footer')");
      if(file==='styled.xlsx')await c.check(win,'worksheet size moves to the top while sheet navigation stays at the bottom',"!!document.querySelector('.idbar .sheet-dimensions')&&!!document.querySelector('.sheet-footer .sheets button')&&!document.querySelector('.sheet-footer .sheet-dimensions')");
      if(['document.pdf','document.docx','presentation.pptx'].includes(file))await c.check(win,'page navigation stays in its original bottom location',"!!document.querySelector('.page-nav [aria-label=页码]')&&!!document.querySelector('.page-nav [aria-label=下一页]')");
      if(file===name){
        win.unmaximize();win.setContentSize(720,560);win.webContents.setZoomFactor(1.5);
        await c.check(win,'narrow enlarged identity bar fits format name statistics and size',"(()=>{const bar=document.querySelector('.idbar'),b=bar.getBoundingClientRect();return bar.scrollWidth<=bar.clientWidth+1&&[...bar.children].every(el=>{const r=el.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right+1})&&document.querySelector('.filename').getBoundingClientRect().width>25})()");
        await c.snapshot(win,'header-information-cjs');win.webContents.setZoomFactor(1);c.home.webContents.setZoomFactor(1);
      }
    }finally{win.webContents.setZoomFactor(1);c.home.webContents.setZoomFactor(1);c.close(win);}
  }
  const tabs=(await c.program.openPaths([c.fixture(name),c.fixture('image.png')],'tabs'))[0];
  try{
    await c.check(tabs,'source language overrides the extension badge once',"document.querySelector('.badge')?.innerText==='JavaScript'");
    await c.click(tabs,'.tab .tab-name','image.png');await c.check(tabs,'switching files isolates header metadata',"document.querySelector('.preview-tab:not([style*=none]) .badge')?.innerText==='PNG'&&!!document.querySelector('.preview-tab:not([style*=none]) .file-details .image-dimensions')");
    await evictInactivePreviews(c,tabs);await c.click(tabs,'.tab .tab-name',name);
    await c.check(tabs,'metadata reattaches correctly after pressure eviction',"document.querySelector('.preview-tab:not([style*=none]) .badge')?.innerText==='JavaScript'&&document.querySelectorAll('.preview-tab:not([style*=none]) .text-counts').length===1");
  }finally{c.close(tabs);}
  c.pass('header information: text/code language, counts, image/sheet metadata, retained page/sheet navigation and narrow layout verified');
};
export default suite;
