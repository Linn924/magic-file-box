import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
// Session style metadata extends SheetJS row/column records.
declare module 'xlsx' {interface RowInfo {s?:any} interface ColInfo {s?:any}}

import {xlsRecords,word,unicode,join,type BiffRecord} from './biff';
export const borders=['','thin','medium','dashed','dotted','thick','double','hair','mediumDashed','dashDot','mediumDashDot','dashDotDot','mediumDashDotDot','slantDashDot'];
export const patterns=['none','solid','mediumGray','darkGray','lightGray','darkHorizontal','darkVertical','darkDown','darkUp','darkGrid','darkTrellis','lightHorizontal','lightVertical','lightDown','lightUp','lightGrid','lightTrellis','gray125','gray0625'];
const paletteHex=('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF '+
 '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333').split(' ');
const view=(data:Uint8Array)=>new DataView(data.buffer,data.byteOffset,data.byteLength);
const hex=(bytes:Uint8Array)=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
function palette(list:BiffRecord[]){const colors=[...paletteHex],rec=list.find(rec=>rec.id===0x0092);if(rec){const count=view(rec.data).getUint16(0,true);for(let i=0;i<count&&i<56&&2+i*4+4<=rec.data.length;i++)colors[i+8]=hex(rec.data.subarray(2+i*4,5+i*4));}return colors;}
function font(data:Uint8Array,colors:string[]){
  if(data.length<16)throw Error('XLS 字体记录不完整。');const v=view(data),count=data[14],wide=data[15]&1;if(16+count*(wide?2:1)>data.length)throw Error('XLS 字体名称不完整。');
  let name='';for(let i=0;i<count;i++)name+=String.fromCharCode(wide?v.getUint16(16+i*2,true):data[16+i]);
  const flags=v.getUint16(2,true),index=v.getUint16(4,true),esc=v.getUint16(8,true),under=data[10];
  return {name,size:v.getUint16(0,true)/20,bold:v.getUint16(6,true)>=700,italic:!!(flags&2),strike:!!(flags&8),outline:!!(flags&16),shadow:!!(flags&32),condense:!!(flags&64),extend:!!(flags&128),family:data[11],charset:data[12],
    color:index===0x7fff?undefined:{argb:'FF'+(colors[index]||'000000')},vertAlign:esc===1?'superscript':esc===2?'subscript':undefined,
    underline:({1:true,2:'double',33:'singleAccounting',34:'doubleAccounting'} as Record<number,unknown>)[under]||false};
}
function decodeXf(data:Uint8Array,fonts:any[],colors:string[]):any{
  if(data.length!==20)throw Error('仅支持 BIFF8 的常见样式。');const v=view(data),a=v.getUint32(6,true),b=v.getUint32(10,true),c=v.getUint32(14,true),d=v.getUint16(18,true);
  const color=(index:number)=>({argb:'FF'+(colors[index]||(index===65?'FFFFFF':'000000'))});
  const side=(id:number,index:number)=>id?{style:borders[id],color:color(index)}:undefined;
  const own={font:fonts[v.getUint16(0,true)]||fonts[0],
    alignment:{horizontal:['general','left','center','right','fill','justify','centerContinuous','distributed'][a&7],vertical:['top','middle','bottom','justify','distributed'][(a>>4)&7]||'bottom',wrapText:!!(a&8),textRotation:((a>>8)&255)===255?'vertical':((a>>8)&255)>90?90-((a>>8)&255):((a>>8)&255),indent:(a>>16)&15,shrinkToFit:!!(a&(1<<20)),readingOrder:((a>>22)&3)===1?'ltr':((a>>22)&3)===2?'rtl':undefined},
    border:{left:side(b&15,(b>>16)&127),right:side((b>>4)&15,(b>>23)&127),top:side((b>>8)&15,c&127),bottom:side((b>>12)&15,(c>>7)&127),diagonal:side((c>>21)&15,(c>>14)&127)},
    fill:{type:'pattern',pattern:patterns[c>>>26]||'none',fgColor:color(d&127),bgColor:color((d>>7)&127)}};
  if(own.border.diagonal){(own.border.diagonal as any).up=!!(b&0x80000000);(own.border.diagonal as any).down=!!(b&0x40000000);}
  // fAtr bits control future updates from the parent, not whether stored fields are used now (MS-XLS CellXF).
  return own;
}
export function readXlsStyles(bytes:Uint8Array,book:XLSX.WorkBook){
  const {list}=xlsRecords(bytes);if(list[0]?.id!==0x0809||view(list[0].data).getUint16(0,true)!==0x600)return;
  const colors=palette(list),fonts:any[]=[],xfs=list.filter(rec=>rec.id===0x00e0).map(rec=>rec.data);for(const rec of list)if(rec.id===0x0031){if(fonts.length===4)fonts.push(undefined);fonts.push(font(rec.data,colors));}
  const styles=xfs.map(data=>({...decodeXf(data,fonts,colors),numFmt:book.SSF?.[view(data).getUint16(2,true)]})),sheets=new Map<number,string>();
  let ordinal=0;for(const rec of list)if(rec.id===0x0085){if(rec.data[5]===0)sheets.set(view(rec.data).getUint32(0,true),book.SheetNames[ordinal]);ordinal++;}
  let offset=0;
  let name:string|undefined;offset=0;for(const rec of list){if(rec.id===0x0809)name=sheets.get(offset);offset+=4+rec.data.length;if(!name)continue;const sheet=book.Sheets[name];if(!sheet)continue;
    if(rec.id===0x208&&rec.data.length>=16){const v=view(rec.data),r=v.getUint16(0,true),flags=v.getUint32(12,true);if(flags&0x80){sheet['!rows']??=[];sheet['!rows'][r]={...sheet['!rows'][r],s:styles[(flags>>>16)&0xfff]};}}
    if(rec.id===0x7d&&rec.data.length>=8){const v=view(rec.data),id=v.getUint16(6,true);sheet['!cols']??=[];for(let c=v.getUint16(0,true);c<=v.getUint16(2,true)&&c<256;c++)sheet['!cols'][c]={...sheet['!cols'][c],s:styles[id]};}
    if([0x0006,0x0201,0x0203,0x0204,0x00fd,0x0205,0x027e,0x00be,0x00bd].includes(rec.id)&&rec.data.length>=6){const v=view(rec.data),r=v.getUint16(0,true),col=v.getUint16(2,true);
      const set=(c:number,id:number)=>{const address=XLSX.utils.encode_cell({r,c}),cell=sheet[address];if(styles[id]){sheet[address]=cell||{t:'z'};sheet[address].s=styles[id];}};
      if(rec.id===0x00bd||rec.id===0x00be){const stride=rec.id===0x00bd?6:2;for(let at=4,c=col;at+stride<=rec.data.length-2;at+=stride,c++)set(c,v.getUint16(at,true));}else set(col,v.getUint16(4,true));
    }
  }
}

/** Encode common BIFF8 styles. Font index 4 is reserved; XF references must skip it. */
export function createXlsStyleWriter(header:BiffRecord[]){
  const xfs=header.filter(rec=>rec.id===0xe0),fonts=header.filter(rec=>rec.id===0x31),extra:BiffRecord[]=[],fontIds=new Map<string,number>(),styleIds=new Map<string,number>(),colors:string[]=[];
  const formats=new Map<string,number>(Object.entries(XLSX.SSF.get_table()).map(([id,code])=>[code as string,Number(id)] as [string,number]));for(const rec of header)if(rec.id===0x41e&&rec.data.length>=5){const v=view(rec.data),count=v.getUint16(2,true),wide=rec.data[4]&1;let code='';for(let i=0;i<count;i++)code+=String.fromCharCode(wide?v.getUint16(5+i*2,true):rec.data[5+i]);formats.set(code,v.getUint16(0,true));}
  function color(value:any,fallback:number){const rgb=value?.argb?.slice(-6).toUpperCase();if(!rgb)return fallback;let at=colors.indexOf(rgb);if(at<0){if(colors.length>=56){let best=0,score=Infinity;for(let i=0;i<colors.length;i++){let d=0;for(const p of [0,2,4])d+=(parseInt(rgb.slice(p,p+2),16)-parseInt(colors[i].slice(p,p+2),16))**2;if(d<score){score=d;best=i;}}return best+8;}colors.push(rgb);at=colors.length-1;}return at+8;}
  function fontIndex(f:any){const key=JSON.stringify(f||{});if(fontIds.has(key))return fontIds.get(key)!;const name=f?.name||'Arial';if(name.length>255)throw Error('XLS 字体名称过长。');const data=new Uint8Array(16+name.length*2),v=view(data);v.setUint16(0,Math.round((f?.size||12)*20),true);v.setUint16(2,(f?.italic?2:0)|(f?.strike?8:0)|(f?.outline?16:0)|(f?.shadow?32:0)|(f?.condense?64:0)|(f?.extend?128:0),true);v.setUint16(4,color(f?.color,0x7fff),true);v.setUint16(6,f?.bold?700:400,true);v.setUint16(8,f?.vertAlign==='superscript'?1:f?.vertAlign==='subscript'?2:0,true);data[10]=f?.underline===true?1:({single:1,double:2,singleAccounting:33,doubleAccounting:34} as Record<string,number>)[f?.underline]||0;data[11]=f?.family||0;data[12]=f?.charset||0;data[14]=name.length;data[15]=1;data.set(unicode(name),16);
    const ordinal=fonts.length+extra.filter(rec=>rec.id===0x31).length,index=ordinal>=4?ordinal+1:ordinal;if(index>=1024)throw Error('XLS 字体数量超限，请保存 XLSX。');extra.push({id:0x31,data});fontIds.set(key,index);return index;
  }
  function style(base:number,s:any,alignment?:string){if(!s&&!alignment)return base;const key=base+':'+JSON.stringify(s||{})+':'+alignment;if(styleIds.has(key))return styleIds.get(key)!;const data=xfs[base]?.data.slice();if(!data||data.length!==20)throw Error('XLS 样式记录无效。');const v=view(data),a=s?.alignment||{};
    if(s?.numFmt){const format=formats.get(s.numFmt);if(format===undefined)throw Error('XLS 数字格式未完整映射，请保存 XLSX。');v.setUint16(2,format,true);}
    if(s?.font)v.setUint16(0,fontIndex(s.font),true);
    const h=alignment||a.horizontal||'general',horizontal=['general','left','center','right','fill','justify','centerContinuous','distributed'].indexOf(h),vertical=['top','middle','bottom','justify','distributed'].indexOf(a.vertical||'bottom');
    data[6]=Math.max(0,horizontal)|(a.wrapText?8:0)|(Math.max(0,vertical)<<4);data[7]=a.textRotation==='vertical'?255:a.textRotation<0?90-a.textRotation:a.textRotation||0;data[8]=Math.min(15,a.indent||0)|(a.shrinkToFit?16:0)|(a.readingOrder==='ltr'?64:a.readingOrder==='rtl'?128:0);data[9]=0xfc;
    const border=s?.border||{},side=(name:string)=>border[name]||{},id=(name:string)=>Math.max(0,borders.indexOf(side(name).style||''));
    const b=id('left')|(id('right')<<4)|(id('top')<<8)|(id('bottom')<<12)|(color(side('left').color,64)<<16)|(color(side('right').color,64)<<23)|(side('diagonal').down?0x40000000:0)|(side('diagonal').up?0x80000000:0);
    const fill=s?.fill,c=color(side('top').color,64)|(color(side('bottom').color,64)<<7)|(color(side('diagonal').color,64)<<14)|(id('diagonal')<<21)|(Math.max(0,patterns.indexOf(fill?.pattern||'none'))<<26);
    v.setUint32(10,b>>>0,true);v.setUint32(14,c>>>0,true);v.setUint16(18,color(fill?.fgColor,64)|(color(fill?.bgColor,65)<<7),true);
    const index=xfs.length+extra.filter(rec=>rec.id===0xe0).length;if(index>=4000)throw Error('XLS 样式数量超限，请保存 XLSX。');extra.push({id:0xe0,data});styleIds.set(key,index);return index;
  }
  function finish(){const data=join([word(colors.length),...colors.map(rgb=>new Uint8Array([parseInt(rgb.slice(0,2),16),parseInt(rgb.slice(2,4),16),parseInt(rgb.slice(4,6),16),0]))]);const old=header.findIndex(rec=>rec.id===0x92);if(old>=0)header.splice(old,1);const at=header.findIndex(rec=>rec.id===0xe0);header.splice(at<0?header.length-1:at,0,...extra.filter(rec=>rec.id===0x31));header.splice(header.length-1,0,...extra.filter(rec=>rec.id===0xe0),...(colors.length?[{id:0x92,data}]:[]));}
  return {style,finish};
}

export function normalizeStyle(style:any,theme:string[]=[]):any{
  if(!style||typeof style!=='object')return style;if(Array.isArray(style))return style.map(value=>normalizeStyle(value,theme));
  if(style.argb||style.theme!==undefined||style.indexed!==undefined){let rgb=style.argb?.slice(-6)||theme[style.theme]||paletteHex[style.indexed];if(!rgb)return {};if(style.tint){const tint=style.tint;rgb=[0,2,4].map(at=>Math.round(tint<0?parseInt(rgb.slice(at,at+2),16)*(1+tint):parseInt(rgb.slice(at,at+2),16)*(1-tint)+255*tint).toString(16).padStart(2,'0')).join('');}return {argb:'FF'+rgb.toUpperCase()};}
  return Object.fromEntries(Object.entries(style).map(([key,value])=>[key,normalizeStyle(value,theme)]));
}
function themeColors(styled:ExcelJS.Workbook){const xml=(styled.model as any).themes?.theme1||'',names=['lt1','dk1','lt2','dk2','accent1','accent2','accent3','accent4','accent5','accent6','hlink','folHlink'];return names.map(name=>{const element=xml.match(new RegExp('<(?:\\w+:)?'+name+'\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?'+name+'>'))?.[1]||'';return element.match(/(?:lastClr|val)="([0-9a-fA-F]{6})"/)?.[1]||'';});}
export async function hydrateXlsxStyles(bytes:Uint8Array,book:XLSX.WorkBook){const styled=new ExcelJS.Workbook();await styled.xlsx.load(bytes.slice().buffer);const theme=themeColors(styled);for(const name of book.SheetNames){const sheet=styled.getWorksheet(name);if(!sheet)continue;for(const [address,cell] of Object.entries(book.Sheets[name]))if(!address.startsWith('!')){const rich=sheet.getCell(address);cell.s=normalizeStyle(rich.style,theme);if(rich.numFmt)cell.z=rich.numFmt;}sheet.eachRow({includeEmpty:true},row=>{if(Object.keys(row.style).length){book.Sheets[name]['!rows']??=[];book.Sheets[name]['!rows'][row.number-1]={...book.Sheets[name]['!rows'][row.number-1],s:normalizeStyle(row.style,theme)};}});for(let c=0;c<sheet.columns.length;c++){const column=sheet.getColumn(c+1);if(Object.keys(column.style).length){book.Sheets[name]['!cols']??=[];book.Sheets[name]['!cols'][c]={...book.Sheets[name]['!cols'][c],s:normalizeStyle(column.style,theme)};}}}}
export async function styledXlsx(book:XLSX.WorkBook){
  const styled=new ExcelJS.Workbook();styled.properties.date1904=!!book.Workbook?.WBProps?.date1904;for(const name of book.SheetNames){const input=book.Sheets[name],hidden=book.Workbook?.Sheets?.[book.SheetNames.indexOf(name)]?.Hidden,sheet=styled.addWorksheet(name,{state:hidden===2?'veryHidden':hidden===1?'hidden':'visible'});for(const merge of input['!merges']||[])sheet.mergeCells(XLSX.utils.encode_range(merge));
    for(const [address,cell] of Object.entries(input))if(!address.startsWith('!')){const out=sheet.getCell(address);if(!out.isMerged||out.master.address===address)out.value=cell.f?{formula:cell.f,result:cell.v}:cell.t==='e'?{error:({0:'#NULL!',7:'#DIV/0!',15:'#VALUE!',23:'#REF!',29:'#NAME?',36:'#NUM!',42:'#N/A'} as any)[cell.v]||'#VALUE!'}:cell.v??null;out.style=cell.s||{};if(cell.z)out.numFmt=cell.z;}
    for(const [r,row] of (input['!rows']||[]).entries())if(row){const h=row.hpt??(row.hpx?row.hpx*.75:undefined);if(h!==undefined)sheet.getRow(r+1).height=h;sheet.getRow(r+1).hidden=!!row.hidden;if(row.s)sheet.getRow(r+1).style=row.s;}for(const [c,col] of (input['!cols']||[]).entries())if(col){const w=col.wch??col.width??(col.wpx?(col.wpx-5)/7:undefined);if(w!==undefined)sheet.getColumn(c+1).width=w;sheet.getColumn(c+1).hidden=!!col.hidden;if(col.s)sheet.getColumn(c+1).style=col.s;}
  }return new Uint8Array(await styled.xlsx.writeBuffer());
}
