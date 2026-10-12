import * as XLSX from 'xlsx';
import {join,word,record,unicode,records,type BiffRecord} from './biff';
import {readXlsStyles,createXlsStyleWriter} from './xlsStyles';
import {parseFormula,createFormulaCalculator,type FormulaNode,type FormulaResult} from './formula';
import type {ExcelChange} from '../../../shared/excelEditing';
const errorIds:Record<string,number>={'#NULL!':0,'#DIV/0!':7,'#VALUE!':15,'#REF!':23,'#NAME?':29,'#NUM!':36,'#N/A':42};
const functionIds:Record<string,number>={COUNT:0,IF:1,SUM:4,AVERAGE:5,MIN:6,MAX:7,ABS:24,ROUND:27,VLOOKUP:102,COUNTA:169,ROUNDUP:212,ROUNDDOWN:213};
function location(address:string){const pos=XLSX.utils.decode_cell(address.replace(/\$/g,''));if(pos.r>=65536||pos.c>=256)throw Error('XLS 引用不能超过 IV65536。');const m=address.match(/^(\$?)[A-Za-z]+(\$?)\d+$/)!;return {r:pos.r,c:pos.c|(m[1]?0:0x4000)|(m[2]?0:0x8000)};}
export function compileXlsFormula(formula:string,sheets:string[]){
  const ast=parseFormula(formula),binary:Record<string,number>={'+':3,'-':4,'*':5,'/':6,'^':7,'&':8,'<':9,'<=':10,'=':11,'>=':12,'>':13,'<>':14};
  function compile(node:FormulaNode):Uint8Array{
    if(node.type==='literal'){if(typeof node.value==='number'){const a=new Uint8Array(9);a[0]=0x1f;new DataView(a.buffer).setFloat64(1,node.value,true);return a;}if(typeof node.value==='boolean')return new Uint8Array([0x1d,Number(node.value)]);const value=String(node.value??'');if(value.length>255)throw Error('XLS 公式文本参数最多 255 字符，请保存 XLSX。');return join([new Uint8Array([0x17,value.length,1]),unicode(value)]);}
    if(node.type==='error'){if(errorIds[node.error]===undefined)throw Error('不支持该 XLS 公式错误常量。');return new Uint8Array([0x1c,errorIds[node.error]]);}
    if(node.type==='ref'){const a=location(node.a),b=node.b?location(node.b):undefined;let prefix:Uint8Array;
      if(node.sheet){const index=sheets.findIndex(name=>name.toLowerCase()===node.sheet!.toLowerCase());if(index<0)throw Error('XLS 公式引用了不存在的工作表。');prefix=join([new Uint8Array([b?0x3b:0x5a]),word(index)]);}else prefix=new Uint8Array([b?0x25:0x44]);
      return join([prefix,b?join([word(a.r),word(b.r),word(a.c),word(b.c)]):join([word(a.r),word(a.c)])]);
    }
    if(node.type==='unary')return join([compile(node.value),new Uint8Array([node.op==='-'?0x13:node.op==='%'?0x14:0x12])]);
    if(node.type==='binary')return join([compile(node.left),compile(node.right),new Uint8Array([binary[node.op],0x15])]);
    const id=functionIds[node.name];if(id===undefined)throw Error('XLS 暂不写入函数 '+node.name+'。');return join([...node.args.map(compile),new Uint8Array([0x42,node.args.length]),word(id)]);
  }
  const bytes=compile(ast);if(bytes.length>8192)throw Error('XLS 公式过长，请保存 XLSX。');return join([word(bytes.length),bytes]);
}
export const readXlsAlignments=readXlsStyles;
export async function exportXlsCopy(book:XLSX.WorkBook,changes:ExcelChange[]){
  const calculator=createFormulaCalculator(book),results=new Map<string,FormulaResult>();let count=0;
  for(const name of book.SheetNames){const sheet=book.Sheets[name],range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):undefined;if(range&&(range.e.r>=65536||range.e.c>=256))throw Error('XLS 最多 65536 行、256 列，请保存 XLSX。');if(range&&(range.e.r-range.s.r+1)*(range.e.c-range.s.c+1)>2000000)throw Error('XLS 输出区域过大，请保存 XLSX。');
    for(const address of Object.keys(sheet).filter(key=>!key.startsWith('!'))){const cell=sheet[address];if(cell.F)throw Error('XLS 不改写数组公式，请保存 XLSX。');if(cell.f){const result=calculator.result(name,address);if(result.error==='#UNSUPPORTED!'||result.error==='#LIMIT!'||result.error==='#CYCLE!')throw Error('XLS 中有未支持、循环引用或超出计算范围的公式，请保存 XLSX。');results.set(JSON.stringify([name,address]),result);cell.bf=compileXlsFormula(cell.f,book.SheetNames);cell.v=result.error?0:typeof result.value==='number'?result.value:0;if(++count%100===0)await new Promise(resolve=>setTimeout(resolve,0));}}
  }
  const raw=new Uint8Array(XLSX.write(book,{type:'array',bookType:'biff8',bookSST:true,cellStyles:true})),cfb=XLSX.CFB.read(raw,{type:'array'}),stream=XLSX.CFB.find(cfb,'Workbook');if(!stream?.content)throw Error('无法创建 XLS 工作簿。');
  const all=records(new Uint8Array(stream.content)),header:BiffRecord[]=[],sheets:BiffRecord[][]=[];let current=header;
  for(const rec of all){if(rec.id===0x0809&&current!==header&&current.at(-1)?.id===0x000a){current=[];sheets.push(current);}else if(rec.id===0x0809&&header.at(-1)?.id===0x000a){current=[];sheets.push(current);}current.push(rec);}
  const writer=createXlsStyleWriter(header),alignments=new Map(changes.filter(change=>change.alignment).map(change=>[JSON.stringify([change.sheet,change.address]),change.alignment!]));
  const outputSheets=sheets.map((list,index)=>{const name=book.SheetNames[index],output:BiffRecord[]=[];for(const rec of list){
    if([0x0006,0x0201,0x0203,0x0204,0x00fd,0x0205].includes(rec.id)&&rec.data.length>=6){const v=new DataView(rec.data.buffer,rec.data.byteOffset,rec.data.byteLength),address=XLSX.utils.encode_cell({r:v.getUint16(0,true),c:v.getUint16(2,true)}),key=JSON.stringify([name,address]),alignment=alignments.get(key);v.setUint16(4,writer.style(v.getUint16(4,true),book.Sheets[name][address]?.s,alignment),true);
      if(rec.id===0x0006){const result=results.get(key);if(!result)throw Error('XLS 公式结果缺失。');rec.data.fill(0,6,14);if(result.error){rec.data[6]=2;rec.data[8]=errorIds[result.error]??23;rec.data[12]=rec.data[13]=255;}else if(typeof result.value==='number')v.setFloat64(6,result.value,true);else {rec.data[6]=typeof result.value==='boolean'?1:result.value===''?3:0;rec.data[8]=Number(result.value===true);rec.data[12]=rec.data[13]=255;}
        output.push(rec);if(!result.error&&typeof result.value==='string'&&result.value!==''){if(result.value.length>4000)throw Error('XLS 公式结果文本过长，请保存 XLSX。');output.push({id:0x0207,data:join([word(result.value.length),new Uint8Array([1]),unicode(result.value)])});}continue;
      }
    }
    if(rec.id===0x007d&&rec.data.length>=8){const v=new DataView(rec.data.buffer),c=v.getUint16(0,true),style=book.Sheets[name]['!cols']?.[c]?.s;if(style)v.setUint16(6,writer.style(16,style),true);}
    if(rec.id===0x0200){for(const [r,row] of (book.Sheets[name]['!rows']||[]).entries())if(row){const data=new Uint8Array(16),v=new DataView(data.buffer);v.setUint16(0,r,true);v.setUint16(6,Math.round((row.hpt??((row.hpx??24)*.75))*20),true);const style=row.s?writer.style(16,row.s):undefined;v.setUint32(12,0x40|(row.hidden?0x20:0)|(style!==undefined?0x80|(style<<16):0),true);output.push({id:0x0208,data});}}
    output.push(rec);
  }return join(output.map(rec=>record(rec.id,rec.data)));});
  const supbook=join([word(book.SheetNames.length),word(0x0401)]),extern=join([word(book.SheetNames.length),...book.SheetNames.map((_,i)=>join([word(0),word(i),word(i)]))]);
  writer.finish();
  header.splice(header.length-1,0,{id:0x01ae,data:supbook},{id:0x0017,data:extern});
  let offset=header.reduce((n,rec)=>n+4+rec.data.length,0),sheetIndex=0;for(const rec of header)if(rec.id===0x0085){new DataView(rec.data.buffer,rec.data.byteOffset).setUint32(0,offset,true);offset+=outputSheets[sheetIndex++].length;}
  const bytes=join([...header.map(rec=>record(rec.id,rec.data)),...outputSheets]);stream.content=bytes;stream.size=bytes.length;
  const output=new Uint8Array(XLSX.CFB.write(cfb,{type:'array'}));
  const verified=XLSX.read(output,{type:'array',cellFormula:true});
  for(const [key,result] of results){const [name,address]=JSON.parse(key),cell=verified.Sheets[name]?.[address];const matches=result.error?cell?.t==='e'&&cell.v===errorIds[result.error]:cell?.v===result.value;if(!cell?.f||!matches)throw Error('XLS 公式或结果无法完整保存，请选择 XLSX。');}
  return output;
}
