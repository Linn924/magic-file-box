import * as XLSX from 'xlsx';
export type BiffRecord={id:number;data:Uint8Array};
export function join(chunks:Uint8Array[]){const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}return result;}
export function word(value:number){const result=new Uint8Array(2);new DataView(result.buffer).setUint16(0,value,true);return result;}
export function record(id:number,data:Uint8Array){if(data.length>8224)throw Error('XLS 记录过长，请保存 XLSX。');return join([word(id),word(data.length),data]);}
export function unicode(text:string){const result=new Uint8Array(text.length*2),view=new DataView(result.buffer);for(let i=0;i<text.length;i++)view.setUint16(i*2,text.charCodeAt(i),true);return result;}
export function records(bytes:Uint8Array){const result:BiffRecord[]=[];for(let at=0;at+4<=bytes.length;){const view=new DataView(bytes.buffer,bytes.byteOffset+at,4),id=view.getUint16(0,true),size=view.getUint16(2,true);if(!id&&!size)break;if(at+size+4>bytes.length)throw Error('XLS 记录不完整。');result.push({id,data:bytes.slice(at+4,at+size+4)});at+=size+4;}return result;}
export function xlsRecords(bytes:Uint8Array){
  if(bytes[0]===208&&bytes[1]===207){const cfb=XLSX.CFB.read(bytes,{type:'array'}),stream=XLSX.CFB.find(cfb,'Workbook')||XLSX.CFB.find(cfb,'Book');if(!stream?.content)throw Error('没有可读取的 XLS 工作簿。');return {cfb,list:records(new Uint8Array(stream.content))};}
  return {cfb:undefined,list:records(bytes)};
}
