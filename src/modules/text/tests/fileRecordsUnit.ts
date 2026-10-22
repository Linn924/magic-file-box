import assert from 'node:assert/strict';
import {openTextRecords} from '../core/fileRecords';
import type {SourceReader} from '@shared/fileSource';

const signal=new AbortController().signal;
function reader(text:string|Uint8Array,ext='txt',chunk=Infinity):SourceReader {
  const bytes=typeof text==='string'?new TextEncoder().encode(text):text;
  return {size:bytes.length,ext,async read(offset,length,signal){signal.throwIfAborted();return bytes.slice(offset,offset+Math.min(length,chunk));}};
}
const plain=Array.from({length:800},(_,i)=>'行 '+i+' 中文 😀').join('\r\n');
for(const [data,encoding] of [[new TextEncoder().encode(plain),'utf-8'],[new Uint8Array(Buffer.from('\ufeff'+plain,'utf16le')),'utf-16le']] as const){
  const source=await openTextRecords(reader(data,'txt',encoding==='utf-8'?17:18),signal,encoding);
  assert.equal((await source.page({start:0,count:3},signal)).rows[2].cells[0],'行 2 中文 😀');
  assert.equal((await source.page({start:700,count:3},signal)).rows[0].line,701);
  assert.equal((await source.page({start:256,count:3},signal)).rows[0].cells[0],'行 256 中文 😀');
  assert.equal((await source.page({start:0,query:'行 650'},signal)).match,650);
  await source.close();
}
const csv=await openTextRecords(reader('\ufeffid,description,quoted,tail\r\n00123,"one\r\ntwo","a""b",\r\n2,x,y,z','csv',7),signal,'utf-8');
assert.deepEqual((await csv.page({start:1,count:1},signal)).rows[0].cells,['00123','one\r\ntwo','a"b','']);
assert.deepEqual((await csv.page({start:0,count:1},signal)).rows[0].cells,['id','description','quoted','tail']);
assert.equal((await csv.page({start:2,count:1},signal)).rows[0].cells[0],'2');await csv.close();
const long=await openTextRecords(reader('x'.repeat(32766)+'needle'+'😀'.repeat(40000)+'\nend','json',127),signal);
const hit=await long.page({start:0,query:'needle'},signal);assert.equal(hit.match,0);
assert.ok(hit.rows.some(row=>row.continued));assert.ok(hit.rows.every(row=>!row.cells[0].includes('\ufffd')));
const again=await long.page({start:1,count:2},signal);assert.equal(again.rows[0].line,1);assert.equal(again.rows[0].continued,true);
await long.close();
const quotes=await openTextRecords(reader('a,"unclosed\nrest','csv'),signal);
await assert.rejects(quotes.page({start:0},signal),/引号/);await quotes.close();
const largeRecord=await openTextRecords(reader('"'+'x'.repeat(1024*1024+1)+'"','csv'),signal);
await assert.rejects(largeRecord.page({start:0},signal),/预算/);await largeRecord.close();
const controller=new AbortController(),cancelled=await openTextRecords(reader(plain),controller.signal);controller.abort();
await assert.rejects(cancelled.page({start:0},controller.signal),{name:'AbortError'});await cancelled.close();
console.log('PASS file-backed text: UTF boundaries, CRLF, quoted CSV, long-line search, backward seek, cancellation and record budgets');
