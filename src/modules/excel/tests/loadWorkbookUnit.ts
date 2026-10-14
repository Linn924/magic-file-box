import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { loadWorkbook } from '../core/workbook/loadWorkbook';
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
