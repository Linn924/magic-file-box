import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {xlsRecords,type BiffRecord} from './biff';
import {readXlsStyles,hydrateXlsxStyles,borders,patterns} from './xlsStyles';
export type XlsWarning={id:string;label:string;detail:string;locations:string[];kind:'loss'|'approximate'|'unknown'};
const v=(data:Uint8Array)=>new DataView(data.buffer,data.byteOffset,data.byteLength);
function hasDrawing(data:Uint8Array,start=0,end=data.length,depth=0):boolean{
  if(depth>32)return true;for(let at=start;at+8<=end;){const header=v(data),flags=header.getUint16(at,true),type=header.getUint16(at+2,true),size=header.getUint32(at+4,true),next=at+8+size;if(next>end)return true;
    if(type===0xf00a&&size>=8&&!(header.getUint32(at+12,true)&4))return true; // The mandatory patriarch group alone is not a user object.
    if((flags&15)===15&&hasDrawing(data,at+8,next,depth+1))return true;at=next;
  }return false;
}
// Read rich-string flags, including characters split over CONTINUE records.
function richStrings(list:BiffRecord[]){const at=list.findIndex(rec=>rec.id===0xfc);if(at<0)return false;const chunks=[list[at].data];for(let i=at+1;list[i]?.id===0x3c;i++)chunks.push(list[i].data);let part=0,pos=0;
  const read=()=>{while(pos>=chunks[part]?.length){part++;pos=0;if(part>=chunks.length)throw Error('字符串记录不完整。');}return chunks[part][pos++];};
  const integer=(n:number)=>{let out=0;for(let i=0;i<n;i++)out+=read()*2**(i*8);return out;};
  const total=integer(4),unique=integer(4);if(unique>1000000||unique>total)throw Error('字符串数量超出检查范围。');
  for(let i=0;i<unique;i++){const count=integer(2),flags=read(),runs=flags&8?integer(2):0,extension=flags&4?integer(4):0;if(runs)return true;let wide=flags&1;
    for(let c=0;c<count;c++){if(pos===chunks[part].length){part++;pos=0;if(part>=chunks.length)throw Error('字符串记录不完整。');wide=read()&1;}integer(wide?2:1);}
    for(let j=0;j<extension;j++)read();
  }return false;
}
export function inspectBiffCompatibility(bytes:Uint8Array):XlsWarning[]{
  const found=new Map<string,XlsWarning>();const add=(id:string,label:string,detail:string,location='',kind:XlsWarning['kind']='loss')=>{let item=found.get(id);if(!item){item={id,label,detail,locations:[],kind};found.set(id,item);}if(location&&!item.locations.includes(location)&&item.locations.length<8)item.locations.push(location);};
  try{const {list,cfb}=xlsRecords(bytes);if(list[0]?.id!==0x809||v(list[0].data).getUint16(0,true)!==0x600)add('old-biff','较早版本的 XLS 样式','此文件不是 BIFF8；旧版字体、边框、填充无法完整还原。','','unknown');
    if(cfb?.FullPaths.some((path: string)=>/(?:^|\/)(?:VBA|_VBA_PROJECT_CUR|_VBA_PROJECT|PROJECT)(?:\/|$)/i.test(path))||list.some(rec=>rec.id===0xd3))add('macros','VBA 宏','副本不包含宏代码或宏项目。');
    const objects=list.filter(rec=>rec.id===0x5d),noteObjectsOnly=list.some(rec=>rec.id===0x1c)&&objects.length>0&&objects.every(rec=>rec.data.length>=6&&v(rec.data).getUint16(0,true)===0x15&&v(rec.data).getUint16(4,true)===0x19);
    let sheet='工作簿',offset=0;const names=new Map<number,string>();for(const rec of list)if(rec.id===0x85){const n=rec.data[6],wide=rec.data[7]&1;let name='';for(let i=0;i<n;i++)name+=String.fromCharCode(wide?v(rec.data).getUint16(8+i*2,true):rec.data[8+i]);names.set(v(rec.data).getUint32(0,true),name);}
    for(const rec of list){if(names.has(offset))sheet=names.get(offset)!;offset+=4+rec.data.length;if(rec.id===0x809&&rec.data.length>=4&&v(rec.data).getUint16(2,true)===0x20)add('charts','图表','图表及图表工作表无法保留。',sheet);
      if(!noteObjectsOnly&&(rec.id===0x5d||rec.id===0xec&&hasDrawing(rec.data)))add('drawings','图片、形状或嵌入对象','检测到绘图或对象记录；对象内容和位置无法保留。',sheet);
      if(rec.id===0x1c)add('comments','单元格批注','可能保留部分普通文字，但字符格式、位置及非 ASCII 文字无法保证完整。',sheet,'unknown');
      if([0xb0,0xb1,0xc5].includes(rec.id))add('pivot','数据透视表','透视表及其缓存无法保留。',sheet);
      if([0x1b0,0x1b1,0x879,0x87a,0x87b].includes(rec.id))add('conditional','条件格式','条件规则和由规则产生的外观无法保留；普通单元格样式仍可保留。',sheet);
      if(rec.id===0x1be)add('validation','数据验证','下拉列表、输入限制及验证提示无法保留。',sheet);
      if(rec.id===0x18)add('names','命名区域','命名区域及名称定义无法保留。');
      if(rec.id===0x1ae&&rec.data.length>=4&&![0x401,0x3a01].includes(v(rec.data).getUint16(2,true)))add('links','外部工作簿引用','外部工作簿连接无法保留。');
      if(rec.id===0x1b8)add('hyperlinks','超链接','单元格显示文字保留，链接目标无法保留。',sheet);
      if([0x12,0x19,0x63,0x1af].includes(rec.id)&&rec.data.some(byte=>byte))add('protection','工作簿或工作表保护','保护设置无法保留；副本不继承原文件的编辑限制。',sheet);
      if([0x9d,0x9e].includes(rec.id))add('filters','筛选设置','筛选条件及按钮无法保留。',sheet);
      if(rec.id===0xa1||[0x14,0x15].includes(rec.id)&&rec.data[0]!==0||[0x1a,0x1b].includes(rec.id)&&rec.data.length>2)add('print','打印布局','检测到页面设置、页眉页脚或分页记录，副本不保留这些打印设置。',sheet);
      if([0x87d,0x88f].includes(rec.id))add('extended-styles','扩展样式','扩展颜色、主题或渐变等样式无法完整还原。','','unknown');
      if(rec.id===0x293&&rec.data.length>=2&&!(v(rec.data).getUint16(0,true)&0x8000))add('style-names','自定义样式名称','单元格当前外观保留，自定义样式名称及模板无法保留。');
      if(rec.id===0x31&&rec.data.length>=8&&![400,700].includes(v(rec.data).getUint16(6,true)))add('font-weight','特殊字体字重','普通和粗体保留，其他字重将按普通或粗体近似还原。','','approximate');
      if(rec.id===0x31&&rec.data.length>=11&&![0,1,2,33,34].includes(rec.data[10]))add('underline','特殊下划线','此下划线类型无法保留。');
      if(rec.id===0xe0&&rec.data.length===20){const b=v(rec.data).getUint32(10,true),c=v(rec.data).getUint32(14,true);if([b&15,(b>>4)&15,(b>>8)&15,(b>>12)&15,(c>>21)&15].some(id=>id>13))add('border-style','不支持的边框样式','此边框样式无法保留。','');if(c>>>26>=19)add('fill-pattern','不支持的填充图案','此填充图案无法保留。','');if(rec.data[6]&128)add('last-line','分散对齐的末行设置','末行分散对齐设置无法保留。');}
      if(rec.id===0x7d&&rec.data.length>=8&&![0,15].includes(v(rec.data).getUint16(6,true)))add('column-style','整列默认样式','已有单元格样式保留，整列对新单元格的默认样式无法保留。',sheet);
      if(rec.id===0x208&&rec.data.length>=16&&v(rec.data).getUint32(12,true)&0x80)add('row-style','整行默认样式','已有单元格样式保留，整行对新单元格的默认样式无法保留。',sheet);
    }
    try{if(richStrings(list))add('rich-text','单元格内多种文字样式','文本保留，但同一格内不同字符的字体、颜色等格式会合并为单元格样式。');}catch{add('rich-text-check','富文本检查未完成','字符串记录超出当前检查能力，无法确认字符级格式是否完整。','','unknown');}
  }catch{add('unrecognized','无法完整识别的 XLS 内容','仅能提取基础数据，无法确认此文件的样式和对象是否完整保留。','','unknown');}
  return [...found.values()];
}
export async function inspectXlsSave(source:Uint8Array,current:Uint8Array,ext:string,format:string):Promise<XlsWarning[]>{
  const found=new Map(inspectBiffCompatibility(source).map(item=>[item.id,item]));
  // The direct BIFF writer preserves ordinary hyperlinks; the structure/XLSX bridge does not.
  if(ext==='xls'&&format==='xls')found.delete('hyperlinks');
  const add=(id:string,label:string,detail:string,location:string,kind:XlsWarning['kind']='loss')=>{let item=found.get(id);if(!item){item={id,label,detail,locations:[],kind};found.set(id,item);}if(location&&!item.locations.includes(location)&&item.locations.length<8)item.locations.push(location);};
  const book=XLSX.read(current,{type:'array',cellStyles:true,cellNF:true,sheetStubs:true});try{if(ext==='xlsx')await hydrateXlsxStyles(current,book);else readXlsStyles(current,book);}catch{add('style-check','样式检查未完成','部分样式无法读取，无法确认字体、边框和填充是否完整。','','unknown');}
  const colors=new Set<string>();for(const name of book.SheetNames)for(const [address,cell] of Object.entries(book.Sheets[name]))if(!address.startsWith('!')){const s=cell.s;if(!s)continue;const location=name+'!'+address;
    if(s.fill?.type==='gradient')add('gradient','渐变填充','XLS 副本不保留渐变填充。',location);
    else if(s.fill?.pattern&&!patterns.includes(s.fill.pattern))add('fill-pattern','不支持的填充图案','此填充图案无法保留。',location);
    for(const [side,border] of Object.entries(s.border||{}))if((border as any)?.style&&!borders.includes((border as any).style))add('border-style','不支持的边框样式','此边框样式无法保留。',location+'（'+side+'）');
    const collect=(value:any)=>{if(value?.argb)colors.add(value.argb.slice(-6).toUpperCase());};collect(s.font?.color);for(const border of Object.values(s.border||{}))collect((border as any)?.color);if(s.fill?.type==='pattern'){collect(s.fill.fgColor);collect(s.fill.bgColor);}
  }
  if(format==='xls'&&colors.size>56)add('palette','超过 XLS 调色板容量的颜色','使用了 '+colors.size+' 种颜色；XLS 调色板最多 56 种，超出颜色将匹配为较接近的已有颜色。','','approximate');
  if(ext==='xlsx'){const zip=await JSZip.loadAsync(current);if(zip.file('xl/styles.xml')){const text=await zip.file('xl/styles.xml')!.async('string');if(/<(?:\w+:)?gradientFill\b/.test(text))add('gradient','渐变填充','XLS 副本不保留渐变填充。','');}}
  return [...found.values()];
}
