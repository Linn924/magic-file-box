import {evictInactivePreviews} from '../../../../tests/previewPressure';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream,existsSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type {Suite} from '../../../../tests/context';
import {sourceFixtures} from '../../../../tests/sourceFixtures';
const digest=async(file:string)=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const suite:Suite=async c=>{
  const files=await sourceFixtures(),file=path.resolve('work/large-source-fixtures/excel-session-wide-v1.xlsx');
  if(!existsSync(file)){
    const book=new ExcelJS.Workbook(),data=book.addWorksheet('Data'),other=book.addWorksheet('Other');
    for(let r=1;r<=240;r++){data.getCell(r,1).value='row-'+r;data.getCell(r,41).value='far-'+r;data.getCell(r,81).value='tail-'+r;}
    other.getCell('A1').value='narrow-sheet-marker';other.getCell('B1').value='value';
    const archive=await JSZip.loadAsync(await book.xlsx.writeBuffer());archive.file('embedded/local-test-data.bin',createReadStream(files.txt,{start:0,end:32*1024*1024-1}),{compression:'STORE'});
    await pipeline(archive.generateNodeStream({streamFiles:true,type:'nodebuffer',compression:'STORE'}),createWriteStream(file));
  }
  const before=await digest(file),initial=c.program.previewResourceStats();
  const tabs=(await c.program.openPaths([file,c.fixture('text.txt')],'tabs'))[0];let target:typeof tabs|undefined;
  const position="(()=>{const table=document.querySelector('.source-table');return {row:table?.querySelector('[data-source-row]')?.dataset.sourceRow,column:table?.querySelector('thead th:nth-child(2)')?.textContent,sheet:document.querySelector('.source-controls select')?.value}})()";
  try{
    await c.check(tabs,'large XLSX has a bounded read-only table',"document.querySelector('.source-table tbody tr')&&document.querySelectorAll('[data-source-row]').length<=100&&!document.querySelector('.excel-edit-toggle,.excel-save-copy,.file-print-button,.loading')");
    await c.click(tabs,'.source-footer button','后 40 列');await c.check(tabs,'wide workbook reaches a later column group before changing sheets',"document.querySelector('.source-table thead th:nth-child(2)')?.textContent==='AO'&&!document.querySelector('.source-loading')");
    await c.evaluate(tabs,"(()=>{const select=document.querySelector('.source-controls select');select.value=[...select.options].find(option=>option.textContent==='Other').value;select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await c.check(tabs,'narrow worksheet starts at its visible first column',"document.querySelector('.source-table thead th:nth-child(2)')?.textContent==='A'&&document.querySelector('.source-table').textContent.includes('narrow-sheet-marker')&&!document.querySelector('.source-loading')");
    await c.evaluate(tabs,"(()=>{const select=document.querySelector('.source-controls select');select.value=[...select.options].find(option=>option.textContent==='Data').value;select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await c.check(tabs,'returning to the wide sheet starts from its first column',"document.querySelector('.source-table thead th:nth-child(2)')?.textContent==='A'&&document.querySelector('.source-table').textContent.includes('row-1')&&!document.querySelector('.source-loading')");
    await c.click(tabs,'.source-footer button','下一段');await c.check(tabs,'large XLSX advances to later logical rows',"Number(document.querySelector('[data-source-row]')?.dataset.sourceRow)>0&&!document.querySelector('.source-loading')");
    await c.click(tabs,'.source-footer button','后 40 列');await c.check(tabs,'large XLSX reaches a later column group',"document.querySelector('.source-table thead th:nth-child(2)')?.textContent==='AO'&&!document.querySelector('.source-loading')");
    const saved=await c.evaluate<{row:string;column:string;sheet:string}>(tabs,position);
    await c.click(tabs,'.tab .tab-name','text.txt');await evictInactivePreviews(c,tabs);
    assert.equal(c.program.previewResourceStats().sourceSessions,initial.sourceSessions,'evicted workbook must release its range session');
    await c.click(tabs,'.tab .tab-name',path.basename(file));
    await c.check(tabs,'large XLSX restores row column and sheet after pressure eviction',`JSON.stringify(${position})===${JSON.stringify(JSON.stringify(saved))}&&!document.querySelector('.loading')`);
    const id=await c.evaluate<string>(tabs,"[...document.querySelectorAll('.preview-tab')].find(tab=>tab.getClientRects().length).dataset.fileId");target=await c.open('data.json');
    await c.evaluate(target,`(()=>{const data=new DataTransfer();data.setData('application/x-file-preview-tab',${JSON.stringify(id)});document.querySelector('main').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));})()`);
    await c.check(target,'large XLSX transfer preserves its logical sheet row and columns',`JSON.stringify(${position})===${JSON.stringify(JSON.stringify(saved))}&&!document.querySelector('.loading')`);
    const token='excel-source-owner-audit-token';await c.evaluate(target,`window.localPreview.openFileSource(${JSON.stringify(id)},'${token}')`);
    await c.check(c.home,'foreign window cannot read the workbook source token',`window.localPreview.readFileSource('${token}',{start:0,count:1}).then(()=>false,()=>true)`);
    await c.evaluate(target,`window.localPreview.closeFileSource('${token}')`);
    await c.check(target,'released workbook token cannot be reused',`window.localPreview.readFileSource('${token}',{start:0,count:1}).then(()=>false,()=>true)`);
    await c.snapshot(target,'excel-source-restored');
  }finally{
    if(!tabs.isDestroyed())c.close(tabs);if(target&&!target.isDestroyed())c.close(target);
    for(let i=0;i<100&&(c.program.previewResourceStats().sourceSessions||c.program.previewResourceStats().sourceHandles);i++)await c.pause(50);
  }
  const end=c.program.previewResourceStats();assert.equal(end.sourceSessions,initial.sourceSessions);assert.equal(end.sourceHandles,initial.sourceHandles);assert.equal(end.sourceReads,0);assert.equal(await digest(file),before);c.pass('large workbook lifecycle releases sessions handles and reads while preserving source SHA256');
};
export default suite;
