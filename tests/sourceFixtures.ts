import {createReadStream,createWriteStream,existsSync,readFileSync,mkdirSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import JSZip from 'jszip';
const root=path.resolve('work/large-source-fixtures');
export async function sourceFixtures():Promise<Record<string,string>>{
  mkdirSync(root,{recursive:true});
  const size=300*1024*1024;
  async function repeated(name:string,unit:string,prefix='',suffix=''){
    const file=path.join(root,name);if(existsSync(file))return file;
    const handle=await open(file,'w');try{await handle.write(prefix);const batch=Buffer.from(unit.repeat(Math.max(1,Math.floor(1024*1024/Buffer.byteLength(unit)))));let count=Buffer.byteLength(prefix);while(count<size){await handle.write(batch);count+=batch.length;}await handle.write(suffix);}finally{await handle.close();}return file;
  }
  const txt=await repeated('records.txt','local record 中文 '+ 'x'.repeat(480)+'\r\n');
  const csv=await repeated('records.csv','00123,"comma, value","two\nlines","a""b",'+ 'x'.repeat(480)+'\r\n');
  const json=await repeated('records.json','{"name":"中文","value":"'+ 'x'.repeat(480)+'"},\n','[\n','{}]\n');
  const pdf=path.join(root,'range.pdf');
  if(!existsSync(pdf)){
    const handle=await open(pdf,'w');let offset=0;const offsets:number[]=[];
    const write=async(value:string|Buffer)=>{const bytes=typeof value==='string'?Buffer.from(value):value;await handle.write(bytes);offset+=bytes.length;};
    try{
      await write('%PDF-1.4\n');
      const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'];
      const content='BT /F1 20 Tf 40 700 Td (Large range preview) Tj ET';objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
      for(const [i,object] of objects.entries()){offsets.push(offset);await write(`${i+1} 0 obj\n${object}\nendobj\n`);}
      offsets.push(offset);await write(`6 0 obj\n<< /Type /EmbeddedFile /Length ${size} >>\nstream\n`);
      const block=Buffer.alloc(1024*1024,32);for(let i=0;i<300;i++)await write(block);await write('\nendstream\nendobj\n');
      const xref=offset;await write(`xref\n0 7\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    }finally{await handle.close();}
  }
  const office:Record<string,string>={};
  for(const [ext,base] of [['xlsx','styled.xlsx'],['docx','document.docx'],['pptx','presentation.pptx']]){
    const file=path.join(root,'document.'+ext);office[ext]=file;if(existsSync(file))continue;
    const zip=await JSZip.loadAsync(readFileSync(path.resolve('work/fixtures',base)));
    // A large package with untouched embedded data proves that unselected ZIP entries aren't read.
    zip.file('embedded/local-test-data.bin',createReadStream(txt),{compression:'STORE'});
    await pipeline(zip.generateNodeStream({streamFiles:true,type:'nodebuffer',compression:'STORE'}),createWriteStream(file));
  }
  const image=path.join(root,'pixels.bmp');
  if(!existsSync(image)){
    const width=9000,height=7000,length=width*height*4,header=Buffer.alloc(54);header.write('BM');header.writeUInt32LE(54+length,2);header.writeUInt32LE(54,10);header.writeUInt32LE(40,14);header.writeInt32LE(width,18);header.writeInt32LE(height,22);header.writeUInt16LE(1,26);header.writeUInt16LE(32,28);header.writeUInt32LE(length,34);
    const handle=await open(image,'w');try{await handle.write(header);const row=Buffer.alloc(width*4);for(let i=0;i<width;i++){row[i*4]=200;row[i*4+1]=80;row[i*4+2]=20;row[i*4+3]=255;}const batch=Buffer.concat(Array(100).fill(row));for(let i=0;i<height/100;i++)await handle.write(batch);}finally{await handle.close();}
  }
  return {txt,csv,json,pdf,image,...office};
}
