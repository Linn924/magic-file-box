import {parseFormula} from './formula';
import type {ExcelValue,ExcelChange} from '../../../shared/excelEditing';
export function parseExcelInput(input:string):ExcelValue {
  validateExcelText(input);
  return parsedInput(input);
}
export function validateExcelText(input:string){
  if(input.length>32767)throw Error('单元格最多 32767 个字符。');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(input))throw Error('单元格包含无法保存的控制字符。');
}
function parsedInput(input:string):ExcelValue {
  if(input==='')return {kind:'blank'};
  if(input.startsWith("'"))return {kind:'text',value:input.slice(1)};
  if(input.startsWith('=')){
    const formula=input.slice(1).trim();
    parseFormula(formula);return {kind:'formula',value:formula};
  }
  if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input.trim())){const value=Number(input);if(/^[+-]?\d+$/.test(input.trim())&&input.trim().replace(/^[+-]?0*/,'').length>15)return {kind:'text',value:input};if(!Number.isFinite(value))throw Error('数字超出范围。');return {kind:'number',value};}
  return {kind:'text',value:input};
}
export function excelInput(value:ExcelValue){return value.kind==='blank'?'':value.kind==='formula'?'='+value.value:value.kind==='text'?(value.value.startsWith("'")||/^[=+\-@]/.test(value.value)||/^\d/.test(value.value)?"'"+value.value:value.value):String(value.value);}
export function changeKey(sheet:string,address:string){return JSON.stringify([sheet,address]);}
export function changeSignature(changes:ExcelChange[]){return JSON.stringify([...changes].sort((a,b)=>changeKey(a.sheet,a.address).localeCompare(changeKey(b.sheet,b.address))));}
/** Excel clipboard TSV including quoted tabs/newlines and CRLF. */
export function parseTablePaste(text:string,limit=10000){
  if(text.length>1000000)throw Error('一次粘贴最多 100 万字符。');
  const rows:string[][]=[[]];let value='',quoted=false,atStart=true;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'&&(quoted||atStart)){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;atStart=false;}
    else if(!quoted&&(char==='\t'||char==='\n'||char==='\r')){rows.at(-1)!.push(value);value='';atStart=true;if(char!=='\t'){if(char==='\r'&&text[i+1]==='\n')i++;rows.push([]);}}
    else {value+=char;atStart=false;}
  }
  if(quoted)throw Error('粘贴内容的引号不完整。');
  rows.at(-1)!.push(value);if(rows.length>1&&rows.at(-1)!.length===1&&rows.at(-1)![0]===''&&/[\r\n]$/.test(text))rows.pop();
  if(rows.reduce((sum,row)=>sum+row.length,0)>limit)throw Error(`一次最多粘贴 ${limit} 个单元格。`);return rows;
}
