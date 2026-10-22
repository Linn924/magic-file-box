import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { Suite } from '../../../../tests/context';

const suite: Suite = async c => {
  const rows = Array.from({length: 50000}, (_, r) => Array.from({length: 12}, (_, col) => col === 0 ? 'ROW-'+r : r*12+col));
  const book = XLSX.utils.book_new();XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Data');
  const xlsx = path.resolve('outputs/verification/background.xlsx'), csv = path.resolve('outputs/verification/background.csv');
  writeFileSync(xlsx, XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}));
  writeFileSync(csv, Array.from({length:100000},(_,r)=>[r,'"quoted, value"','"two\nlines"',r+1,r+2,r+3,r+4,r+5].join(',')).join('\n'));
  for (const file of [xlsx,csv]) {
    const digest = () => createHash('sha256').update(readFileSync(file)).digest('hex'), before = digest();
    const win = await c.program.openPath(file);
    await c.check(win, 'background preview mounted', "!!document.querySelector('.preview-body')");
    await c.evaluate(win, `(()=>{window.__beats={ticks:0,last:performance.now(),maxGap:0};window.__beatTimer=setInterval(()=>{const b=window.__beats,now=performance.now();if(['parsing','rendering'].includes(document.querySelector('.preview-body')?.dataset.loadPhase)){b.ticks++;b.maxGap=Math.max(b.maxGap,now-b.last);}b.last=now;},16);})()`);
    await c.check(win, 'real table parses in a responsive renderer', "document.querySelector('.preview-body').dataset.loadPhase==='parsing'&&window.__beats.ticks>=3");
    await c.click(win, '.preview-cancel-load');
    await c.check(win, 'active workbook worker cancels without showing late rows', "!!document.querySelector('.preview-cancelled')&&!document.querySelector('.spreadsheet')");
    await c.pause(250);
    if (c.program.previewResourceStats().parsers) throw Error('Cancelled workbook worker still holds a parser lease');
    await c.click(win, '.preview-retry');
    await c.check(win, 'workbook retry renders actual data', "document.querySelector('.preview-body')?.dataset.loadPhase==='ready'&&!!document.querySelector('td[data-address=A1]')");
    const beats = await c.evaluate<{ticks:number;maxGap:number}>(win, 'window.__beats');
    await c.evaluate(win, 'clearInterval(window.__beatTimer)');
    if (beats.ticks < 3 || beats.maxGap >= 600) throw Error('Background parse blocked UI heartbeat: '+JSON.stringify(beats));
    c.pass(path.extname(file)+' worker heartbeat '+JSON.stringify(beats));
    if (file === csv) await c.check(win, 'CSV worker preserves quoted commas and multiline values', "document.querySelector('td[data-address=B1]').textContent.includes('quoted, value')&&document.querySelector('td[data-address=C1]').textContent.includes('two\\nlines')");
    const last=file===xlsx?'L50000':'H100000',expected=file===xlsx?'599999':'100004';
    await c.evaluate(win, `(()=>{const input=document.querySelector('.cell-locate-input');input.value='${last}';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.cell-locate button').click()})()`);
    await c.check(win, 'chunked transfer preserves the final cell', `document.querySelector('td[data-address=${last}]')?.textContent==='${expected}'`);
    if (before !== digest()) throw Error('Background source modified');
    c.close(win);
  }
  c.pass('background XLSX and CSV sources unchanged (SHA256)');
};
export default suite;
