import assert from 'node:assert/strict';
import {clipboard,dialog} from 'electron';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import type {Suite} from '../../../../tests/context';
import {withSettledHistory} from './editingContext';
const suite:Suite=async c=>{
  c=withSettledHistory(c);const name='edit-reverse-cut-v2.xlsx';
  if(!existsSync(c.fixture(name))){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Data');sheet.getCell('A1').value=1;sheet.getCell('A2').value=2;sheet.getCell('A3').value=3;sheet.getCell('D1').value={formula:'SUM(A3:A1)',result:6};sheet.getCell('D5').value={formula:'SUM(A3:A1)',result:6};writeFileSync(c.fixture(name),Buffer.from(await book.xlsx.writeBuffer()));}
  const original=readFileSync(c.fixture(name)),output=path.resolve('outputs/verification/reverse-reference-cut-copy.xlsx'),realWrite=clipboard.write,realRead=clipboard.read,realText=clipboard.readText,realSave=dialog.showSaveDialog;let items:Electron.ClipboardItem[]=[];
  let destination=output;clipboard.write=async value=>{items=value;};clipboard.read=async()=>items;clipboard.readText=async()=>items[0]?.types.includes('text/plain')?await ((await items[0].getType('text/plain')) as any).text():'';dialog.showSaveDialog=(async()=>({canceled:false,filePath:destination})) as typeof realSave;
  const win=await c.open(name),select=async(address:string,last?:string)=>{await c.click(win,`.spreadsheet td[data-address="${address}"]`);if(last)await c.evaluate(win,`document.querySelector('.spreadsheet td[data-address="${last}"]').dispatchEvent(new MouseEvent('click',{shiftKey:true,bubbles:true}))`);};
  let structure:typeof win|undefined,reopened:typeof win|undefined;
  try{
    await c.check(win,'reverse-range formula initially includes every referenced cell',"document.querySelector('.spreadsheet td[data-address=D1]').textContent==='6'");await c.click(win,'.excel-edit-toggle');
    await select('A2');await c.click(win,'.excel-cut');await c.check(win,'reverse-reference cut is prepared without clearing its source',"document.querySelector('.excel-edit-status').textContent.includes('已剪切')&&document.querySelector('.spreadsheet td[data-address=A2]').textContent==='2'");
    await select('B2');await c.click(win,'[data-group=clipboard] button[title^=粘贴到]');
    await c.check(win,'partial cut through a reverse reference is refused atomically',"document.querySelector('.excel-edit-error')?.textContent.includes('一部分')&&document.querySelector('.spreadsheet td[data-address=A2]').textContent==='2'&&document.querySelector('.spreadsheet td[data-address=B2]').textContent===''&&document.querySelector('.spreadsheet td[data-address=D1]').textContent==='6'&&!document.querySelector('.excel-dirty').textContent.includes('未保存')");
    await c.snapshot(win,'excel-reverse-reference-refusal');
    await select('A1','A3');await c.click(win,'.excel-cut');await c.check(win,'full reverse-reference range cut prepared',"document.querySelector('.excel-edit-status').textContent.includes('已剪切')");await select('B1');await c.click(win,'[data-group=clipboard] button[title^=粘贴到]');
    await c.check(win,'full range move preserves reverse reference order and its result',"document.querySelector('.spreadsheet td[data-address=A2]').textContent===''&&document.querySelector('.spreadsheet td[data-address=B2]').textContent==='2'&&document.querySelector('.spreadsheet td[data-address=D1]').textContent==='6'&&document.querySelector('.spreadsheet td[data-address=D1]').title.includes('SUM(B3:B1)')");
    await c.click(win,'.excel-undo');await c.check(win,'reverse-reference move undo restores all source cells',"document.querySelector('.spreadsheet td[data-address=A2]').textContent==='2'&&document.querySelector('.spreadsheet td[data-address=D1]').title.includes('SUM(A3:A1)')");await c.click(win,'.excel-redo');
    await c.click(win,'.excel-save-copy');await c.check(win,'reverse-reference move saves an explicit clean copy',"document.querySelector('.excel-edit-status')?.textContent.includes('已另存')&&!document.querySelector('.excel-dirty').textContent.includes('未保存')");
    const copy=XLSX.read(readFileSync(output),{type:'buffer'});assert.equal(copy.Sheets.Data.D1.f,'SUM(B3:B1)');assert.equal(copy.Sheets.Data.D1.v,6);assert.equal(copy.Sheets.Data.B2.v,2);assert.deepEqual(readFileSync(c.fixture(name)),original);c.pass('reverse references preserve formula cache and source SHA256 after a full cut and save');
    reopened=await c.program.openPath(output);await c.check(reopened,'reopened reverse-reference copy retains its correct calculation',"document.querySelector('.spreadsheet td[data-address=D1]')?.textContent==='6'");c.close(reopened);reopened=undefined;
    structure=await c.open(name);await c.click(structure,'.excel-edit-toggle');await c.evaluate(structure,"document.querySelector('.spreadsheet td[data-address=A1]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:200}))");await c.click(structure,'.excel-context-menu [data-action=delete-row]');
    await c.check(structure,'deleting the low endpoint shrinks a reverse range into valid references',"document.querySelector('.spreadsheet td[data-address=A1]').textContent==='2'&&document.querySelector('.spreadsheet td[data-address=D4]').textContent==='5'&&document.querySelector('.spreadsheet td[data-address=D4]').title.includes('SUM(A2:A1)')");
    await c.click(structure,'.excel-undo');await c.check(structure,'reverse-range deletion undo restores its formula and source rows',"document.querySelector('.spreadsheet td[data-address=A1]').textContent==='1'&&document.querySelector('.spreadsheet td[data-address=D5]').textContent==='6'");await c.click(structure,'.excel-redo');
    destination=path.resolve('outputs/verification/reverse-reference-structure-copy.xlsx');await c.click(structure,'.excel-save-copy');await c.check(structure,'structural reverse-reference copy saves cleanly',"document.querySelector('.excel-edit-status')?.textContent.includes('已另存')&&!document.querySelector('.excel-dirty').textContent.includes('未保存')");
    const moved=XLSX.read(readFileSync(destination),{type:'buffer'});assert.equal(moved.Sheets.Data.D4.f,'SUM(A2:A1)');assert.equal(moved.Sheets.Data.D4.v,5);assert.deepEqual(readFileSync(c.fixture(name)),original);c.pass('reverse-range structure updates preserve formula results and original source bytes');
  }finally{clipboard.write=realWrite;clipboard.read=realRead;clipboard.readText=realText;dialog.showSaveDialog=realSave;if(reopened&&!reopened.isDestroyed())c.close(reopened);if(structure&&!structure.isDestroyed())c.close(structure);c.close(win);}
};
export default suite;
