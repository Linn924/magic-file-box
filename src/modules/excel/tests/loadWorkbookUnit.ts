import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { loadWorkbook } from '../core/workbook/loadWorkbook';
import { workbookAppearance } from '../core/workbook/previewModel';
const bytes = new Uint8Array(readFileSync('work/fixtures/styled.xlsx'));
const descriptor = Object.getOwnPropertyDescriptor(ExcelJS.Workbook.prototype, 'xlsx')!;
// Simulate an optional style engine rejecting a document that the data engine reads.
Object.defineProperty(ExcelJS.Workbook.prototype, 'xlsx', { configurable: true, get() { return {load: async()=>{throw Error('unsupported style')}}; } });
try {
  const result = await loadWorkbook(bytes, 'xlsx');
  assert.ok(result.book.SheetNames.length > 0);
  assert.ok(result.book.Sheets[result.book.SheetNames[0]]['A1']);
  assert.equal(result.styled, undefined);
  assert.match(result.warning, /基础表格/);
  await assert.rejects(loadWorkbook(new Uint8Array([80,75,3,4,0]), 'xlsx'));
  console.log('PASS optional Excel style failure retains data; invalid ZIP still fails');
} finally { Object.defineProperty(ExcelJS.Workbook.prototype, 'xlsx', descriptor); }

const sample=new ExcelJS.Workbook(),sheet=sample.addWorksheet('样式');
sheet.getCell('A1').value={richText:[{text:'bold',font:{bold:true}},{text:'plain'}]};
sheet.getCell('A1').numFmt='0.00%';
sheet.getCell('B2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF112233'}};
sheet.getRow(3).height=30;sheet.getRow(4).hidden=true;
sheet.getColumn(2).width=24;sheet.getColumn(3).hidden=true;
const image=sample.addImage({buffer:new Uint8Array(readFileSync('work/fixtures/image.png')).buffer,extension:'png'});
sheet.addImage(image,{tl:{col:1.5,row:2.5},ext:{width:40,height:30}});
const appearance=structuredClone(workbookAppearance(sample))!,visible=appearance.sheets['样式'];
assert.equal(visible.cells.A1.style.numFmt,'0.00%');
assert.equal(visible.cells.A1.richText?.[0].font?.bold,true);
assert.equal(visible.cells.B2.style.fill?.type,'pattern','styled blank cells survive');
assert.equal(visible.rows[3].height,30);assert.equal(visible.rows[4].hidden,true);
assert.equal(visible.columns[2].width,24);assert.equal(visible.columns[3].hidden,true);
assert.deepEqual(visible.images[0].range.tl,{col:1.5,row:2.5});
assert.deepEqual(visible.images[0].range.ext,{width:40,height:30});
assert.ok(appearance.media[image].buffer?.length);
console.log('PASS serializable workbook appearance preserves rich text, blank styles, dimensions and images');
