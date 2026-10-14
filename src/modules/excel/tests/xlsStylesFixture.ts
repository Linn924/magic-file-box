import * as XLSX from 'xlsx';
import {join,record,records,type BiffRecord} from '../core/workbook/biff';
// Independent BIFF8 FONT/XF/PALETTE fixture, encoded from the MS-XLS field layout.
// It deliberately does not use the product's style encoder.
export function styleFixture(features:boolean|'macro'=false){
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['样式标题'],['数据',7]]);sheet.B2.z='0.00';sheet.C2={t:'n',v:7};sheet.F2={t:'z'};sheet['!ref']='A1:F2';sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:2}}];sheet['!rows']=[{hpt:30}];sheet['!cols']=[{wch:20}];XLSX.utils.book_append_sheet(book,sheet,'样式表');
  const cfb=XLSX.CFB.read(new Uint8Array(XLSX.write(book,{type:'array',bookType:'biff8',bookSST:true})),{type:'array'}),stream=XLSX.CFB.find(cfb,'Workbook')!,list=records(new Uint8Array(stream.content!));
  const font=new Uint8Array([220,0,10,0,8,0,188,2,0,0,2,2,134,0,2,1,139,91,83,79]);
  const fontOrdinal=list.filter(rec=>rec.id===0x31).length,fontIndex=fontOrdinal>=4?fontOrdinal+1:fontOrdinal,xfs=list.filter(rec=>rec.id===0xe0),cell=list.find(rec=>rec.id===0x203&&new DataView(rec.data.buffer).getUint16(0,true)===1)!;
  const xf=xfs[new DataView(cell.data.buffer).getUint16(4,true)].data.slice(),view=new DataView(xf.buffer);view.setUint16(0,fontIndex,true);view.setUint16(4,1,true);xf.set([25,0,2,252],6);view.setUint32(10,0x05099621,true);view.setUint32(14,0x0410060b,true);view.setUint16(18,0x070d,true);
  const palette=new Uint8Array([7,0,18,52,86,0,255,0,0,0,0,0,255,0,0,128,0,0,255,255,0,0,255,192,128,0,255,255,255,0]);
  const firstXf=list.findIndex(rec=>rec.id===0xe0);list.splice(firstXf,0,{id:0x31,data:font});const headerEnd=list.findIndex(rec=>rec.id===0xa);list.splice(headerEnd,0,{id:0xe0,data:xf},{id:0x92,data:palette});
  let inSheet=false;for(const rec of list){if(rec.id===0x809&&new DataView(rec.data.buffer).getUint16(2,true)===0x10)inSheet=true;if(inSheet&&[0x203,0xfd,0x201].includes(rec.id))new DataView(rec.data.buffer).setUint16(4,xfs.length,true);}
  if(features===true){const extra:BiffRecord[]=[{id:0x1c,data:new Uint8Array([1,0,0,0,0,0,1,0,0,0])},{id:0x1b1,data:new Uint8Array(12)},{id:0x1be,data:new Uint8Array(12)},{id:0x87d,data:new Uint8Array(20)}];list.splice(list.length-1,0,...extra);}
  if(features)XLSX.CFB.utils.cfb_add(cfb,'VBA/dir',new Uint8Array([0]));
  const bounds=list.find(rec=>rec.id===0x85)!,offset=list.slice(0,list.findIndex(rec=>rec.id===0xa)+1).reduce((n,rec)=>n+rec.data.length+4,0);new DataView(bounds.data.buffer).setUint32(0,offset,true);stream.content=join(list.map(rec=>record(rec.id,rec.data)));stream.size=stream.content.length;return new Uint8Array(XLSX.CFB.write(cfb,{type:'array'}));
}
