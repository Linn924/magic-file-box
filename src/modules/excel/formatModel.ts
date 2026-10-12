import * as XLSX from 'xlsx';
export interface FormatPatch {
  font?:{name?:string;size?:number;bold?:boolean;italic?:boolean;underline?:boolean;strike?:boolean;color?:string|null};
  fill?:string|null;
  alignment?:{horizontal?:'left'|'center'|'right';vertical?:'top'|'middle'|'bottom';wrapText?:boolean;indent?:number;textRotation?:number};
  numFmt?:string;
  border?:{preset:'all'|'outer'|'inner'|'left'|'right'|'top'|'bottom'|'none';style:string;color:string};
}
export function validateFormat(patch:FormatPatch){
  const color=(value:string|null|undefined)=>{if(value!==undefined&&value!==null&&!/^[0-9A-Fa-f]{6}$/.test(value))throw Error('颜色必须是六位十六进制颜色。');};
  if(patch.font?.name!==undefined&&(!patch.font.name.trim()||patch.font.name.length>255||/[\u0000-\u001f]/.test(patch.font.name)))throw Error('字体名称无效。');
  if(patch.font?.size!==undefined&&(!Number.isFinite(patch.font.size)||patch.font.size<1||patch.font.size>409))throw Error('字号范围为 1–409。');color(patch.font?.color);color(patch.fill);
  if(patch.alignment?.indent!==undefined&&(!Number.isInteger(patch.alignment.indent)||patch.alignment.indent<0||patch.alignment.indent>15))throw Error('缩进范围为 0–15。');
  if(patch.alignment?.textRotation!==undefined&&(!Number.isInteger(patch.alignment.textRotation)||Math.abs(patch.alignment.textRotation)>90))throw Error('文字角度范围为 -90–90。');
  if(patch.numFmt!==undefined){if(!patch.numFmt||patch.numFmt.length>128||/[\u0000-\u001f]/.test(patch.numFmt))throw Error('数字格式无效。');try{XLSX.SSF.format(patch.numFmt,1234.56);}catch{throw Error('数字格式表达式无法解析。');}}
  if(patch.border){color(patch.border.color);if(!['thin','medium','thick','dashed','dotted','double','hair','dashDot','mediumDashed','mediumDashDot','dashDotDot','mediumDashDotDot','slantDashDot'].includes(patch.border.style))throw Error('边框线型无效。');}
}
export function borderFor(range:XLSX.Range,p:XLSX.CellAddress,b:NonNullable<FormatPatch['border']>){const sides:Record<string,{style:string;color:string}|null>={};const edges={left:p.c===range.s.c,right:p.c===range.e.c,top:p.r===range.s.r,bottom:p.r===range.e.r};for(const side of ['left','right','top','bottom'] as const){const apply=b.preset==='all'||b.preset==='none'||b.preset===side&&edges[side]||b.preset==='outer'&&edges[side]||b.preset==='inner'&&!edges[side];if(apply)sides[side]=b.preset==='none'?null:{style:b.style,color:b.color};}return sides;}
