import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import type {Suite} from '../context';
import {sourceFixtures} from '../sourceFixtures';
import {evictInactivePreviews} from '../previewPressure';
import {encryptedFixture} from '../../src/modules/pdf/tests/encryptedFixture';
import {loadWorkbook} from '../../src/modules/excel/core/workbook/loadWorkbook';
import {updateTest} from '../updateDriver';

const suite:Suite=async c=>{
  const large=await sourceFixtures(),styleName='notice-style-fallback-v1.xlsx';
  if(!existsSync(c.fixture(styleName))){
    const archive=await JSZip.loadAsync(readFileSync(c.fixture('styled.xlsx'))),style=await archive.file('xl/styles.xml')!.async('string');
    archive.file('xl/styles.xml',style.replace('</styleSheet>','<fixture-unclosed></styleSheet>'));
    writeFileSync(c.fixture(styleName),await archive.generateAsync({type:'nodebuffer'}));
  }
  assert.ok((await loadWorkbook(new Uint8Array(readFileSync(c.fixture(styleName))),'xlsx')).warning,'fixture must trigger the real optional-style warning');
  const svg='notice-large-source-v1.svg';if(!existsSync(c.fixture(svg)))writeFileSync(c.fixture(svg),'<svg xmlns="http://www.w3.org/2000/svg"></svg>\n<!--'+'x'.repeat(9*1024*1024)+'-->');
  const cases:Array<[string,string]>= [[large.txt,'大文件按块读取'],[large.csv,'大型 CSV/TSV'],[large.xlsx,'大型工作簿'],[large.docx,'大型 DOCX'],[large.pptx,'大型 PPTX'],[large.image,'大图片从源文件读取'],[c.fixture(svg),'大型 SVG'],[c.fixture('invalid.json'),'JSON 格式不完整'],[c.fixture(styleName),'部分样式或图片无法还原']];
  for(const [file,message] of cases){
    const win=await c.program.openPath(file);
    try{
      await c.check(win,path.basename(file)+' shows a file-scoped lower-right preview notice',`document.querySelector('.preview-notice')?.textContent.includes(${JSON.stringify(message)})&&document.querySelector('.preview-notice-file')?.textContent===${JSON.stringify(path.basename(file))}&&!document.querySelector('.preview-tab .notice,.preview-tab .pdf-perm-note')`);
      await c.check(win,'notice is outside toolbar and reading layout',"!document.querySelector('.preview-tab').contains(document.querySelector('.preview-notice'))&&document.querySelector('#preview-notice-target').contains(document.querySelector('.preview-notice'))&&getComputedStyle(document.querySelector('.notification-stack')).position==='fixed'");
      const before=await c.evaluate(win,"(()=>{const el=document.querySelector('.preview-body');return {rect:el.getBoundingClientRect().toJSON(),top:el.scrollTop}})()");
      await c.evaluate(win,"document.querySelector('.preview-notice-dismiss').focus()");await c.click(win,'.preview-notice-dismiss');
      await c.check(win,'manual dismissal hides the notice and restores preview focus',"!document.querySelector('.preview-notice')&&document.activeElement===document.querySelector('.preview-body')");
      assert.deepEqual(await c.evaluate(win,"(()=>{const el=document.querySelector('.preview-body');return {rect:el.getBoundingClientRect().toJSON(),top:el.scrollTop}})()"),before,'notification dismissal must not resize or scroll content');
    }finally{c.close(win);}
  }
  const tabs=(await c.program.openPaths([c.fixture('invalid.json'),large.xlsx],'tabs'))[0];
  let target:typeof tabs|undefined;
  try{
    await c.check(tabs,'first tab owns its JSON fallback notice',"document.querySelector('.preview-notice')?.textContent.includes('JSON 格式不完整')");
    await c.click(tabs,'.preview-notice-dismiss');await c.click(tabs,'.tab .tab-name',path.basename(large.xlsx));
    await c.check(tabs,'another tab retains its own limitation notice',"document.querySelector('.preview-notice')?.textContent.includes('大型工作簿')&&!document.querySelector('.preview-notice')?.textContent.includes('JSON 格式不完整')");
    await evictInactivePreviews(c,tabs);await c.click(tabs,'.tab .tab-name','invalid.json');
    await c.check(tabs,'dismissal survives tab changes and pressure remount',"document.querySelector('.preview-tab:not([style*=none]) .preview-body')?.dataset.loadPhase==='ready'&&!document.querySelector('.preview-notice')");
    const id=await c.evaluate<string>(tabs,"document.querySelector('.preview-tab:not([style*=none])').dataset.fileId");target=await c.open('text.txt');
    await c.evaluate(target,`(()=>{const d=new DataTransfer();d.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:d,bubbles:true,cancelable:true}));})()`);
    await c.check(target,'dismissal follows an accepted window transfer',"document.querySelectorAll('.tab').length===2&&document.querySelector('.preview-tab:not([style*=none]) .preview-body')?.dataset.loadPhase==='ready'&&!document.querySelector('.preview-notice')");
  }finally{c.close(tabs);if(target)c.close(target);}
  const reopened=await c.open('invalid.json');
  try{
    await c.check(reopened,'closing and reopening a file starts a new notice session',"!!document.querySelector('.preview-notice')");
    reopened.unmaximize();reopened.setContentSize(720,560);c.program.updateSettings({theme:'dark'});reopened.webContents.setZoomFactor(1.25);
    await c.check(reopened,'dark narrow notice close button is visible and clickable',"(()=>{const el=document.querySelector('.preview-notice-dismiss'),r=el.getBoundingClientRect();return document.documentElement.dataset.theme==='dark'&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()");
    await c.click(reopened,'.settings-button');await c.check(reopened,'settings suppress the notification without dismissing it',"!!document.querySelector('.settings-panel')&&document.querySelector('.notification-stack').getClientRects().length===0");
    await c.click(reopened,'[aria-label=关闭设置]');await c.check(reopened,'notification returns after settings close',"document.querySelector('.preview-notice')?.getClientRects().length>0");
    await c.click(reopened,'.immersive-toggle');await c.check(reopened,'immersive reading hides the notification stack',"document.documentElement.classList.contains('immersive')&&document.querySelector('.notification-stack').getClientRects().length===0");
    await c.evaluate(reopened,'window.localPreview.setFullscreen(false)');await c.check(reopened,'exiting immersive restores the undismissed notification',"!document.documentElement.classList.contains('immersive')&&document.querySelector('.preview-notice')?.getClientRects().length>0");
    await c.evaluate(reopened,'window.localPreview.updateAction("check")');reopened.webContents.send('updates:notice');
    await c.check(reopened,'update and preview notices coexist without overlapping',"(()=>{const a=document.querySelector('.preview-notice')?.getBoundingClientRect(),b=document.querySelector('.update-notice')?.getBoundingClientRect();return a&&b&&(a.bottom<=b.top||b.bottom<=a.top)})()");
    await c.check(reopened,'both notification close icons are geometrically centered',"[...document.querySelectorAll('.preview-notice-dismiss,.update-dismiss')].every(button=>{const b=button.getBoundingClientRect(),s=button.querySelector('svg').getBoundingClientRect();return Math.abs(b.left+b.width/2-s.left-s.width/2)<.5&&Math.abs(b.top+b.height/2-s.top-s.height/2)<.5&&getComputedStyle(button).padding==='0px'})");
    await c.check(reopened,'notification stack is transparent and gaps allow clicks through',"(()=>{const stack=document.querySelector('.notification-stack'),a=document.querySelector('.preview-notice').getBoundingClientRect(),b=document.querySelector('.update-notice').getBoundingClientRect(),s=getComputedStyle(stack);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.querySelector('.preview-notice-target')).backgroundColor==='rgba(0, 0, 0, 0)'&&Number.parseFloat(s.padding)>=16&&!document.elementFromPoint(a.left+10,(a.bottom+b.top)/2)?.closest('.notification-stack')})()");
    await c.snapshot(reopened,'preview-notices-dark-stacked');
    await c.click(reopened,'.preview-notice-dismiss');await c.check(reopened,'closing preview information keeps the update notice',"!document.querySelector('.preview-notice')&&!!document.querySelector('.update-notice')");
    await c.click(reopened,'.update-dismiss');
    assert.equal(updateTest.downloads,0);assert.equal(updateTest.installs,0);
  }finally{reopened.webContents.setZoomFactor(1);c.home.webContents.setZoomFactor(1);c.program.updateSettings({theme:'light'});c.close(reopened);}
  const pdfName='notice-permission-v1.pdf';if(!existsSync(c.fixture(pdfName)))encryptedFixture(c.fixture(pdfName),false);
  const pdf=await c.program.openPath(c.fixture(pdfName));
  try{
    await c.check(pdf,'password prompt stays actionable in its original location',"!!document.querySelector('.pdf-password')&&!document.querySelector('.preview-notice')");
    await c.evaluate(pdf,"(()=>{const input=document.querySelector('.pdf-password input');input.value='secret';input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()");
    await c.check(pdf,'print limitation moves to the notice while enforcement stays enabled',"document.querySelector('.preview-notice')?.textContent.includes('此文档不允许打印')&&!document.querySelector('.pdf-perm-note,.pdf-print-button:not(:disabled)')");
  }finally{c.close(pdf);}
  const broken=await c.open('broken.docx');await c.check(broken,'blocking file errors keep their retry action in the preview',"!!document.querySelector('.error .preview-retry')&&!document.querySelector('.preview-notice')");c.close(broken);
  const repeatedName='notice-repeated-json-v1.json';if(!existsSync(c.fixture(repeatedName)))writeFileSync(c.fixture(repeatedName),'{bad '+ 'needle '.repeat(700));
  const repeated=await c.open(repeatedName);
  try{
    await c.check(repeated,'JSON fallback begins as its own notice',"document.querySelector('.preview-notice')?.textContent.includes('JSON 格式不完整')");
    await c.click(repeated,'.preview-notice-dismiss');await c.click(repeated,'.text-search-toggle');
    const query=async(value:string)=>c.evaluate(repeated,`(()=>{const input=document.querySelector('.text-search-input');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await query('needle');
    await c.check(repeated,'a new limitation can notify after a different notice was dismissed',"document.querySelector('.preview-notice')?.textContent.includes('部分高亮')&&!document.querySelector('.preview-notice')?.textContent.includes('JSON 格式不完整')&&document.querySelector('.text-search-count')?.textContent.includes('700')&&!document.querySelector('.preview-tab .notice')");
    await query('');await c.check(repeated,'resolved search limitation removes its notification',"!document.querySelector('.preview-notice')");
    await query('needle');await c.check(repeated,'an unresolved undismissed limitation can reappear',"document.querySelector('.preview-notice')?.textContent.includes('部分高亮')");
    await c.click(repeated,'.preview-notice-dismiss');await query('');await query('needle');
    await c.check(repeated,'dismissed repeated-search notice stays closed while counts remain complete',"!document.querySelector('.preview-notice')&&document.querySelector('.text-search-count')?.textContent.includes('700')");
  }finally{c.close(repeated);}
  await c.pause(150);
  const stats=c.program.previewResourceStats();assert.equal(stats.sourceSessions,0);assert.equal(stats.sourceHandles,0);
  c.pass('preview notices: source modes, actual Excel warning, JSON/PDF limits, manual close, view stability, tab/pressure/transfer session, dark layout and update stacking verified');
};
export default suite;
