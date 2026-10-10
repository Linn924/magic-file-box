function validFormula(formula:string){
  const tokens:string[]=[];let cursor=0;
  const pattern=/\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(\$?[A-Za-z]{1,3}\$?[1-9]\d*)|([A-Za-z]+)|([()+\-*/^,:]))/y;
  while(cursor<formula.length){pattern.lastIndex=cursor;const match=pattern.exec(formula);if(!match)throw Error('公式语法不正确。');tokens.push(match[1]||match[2]||match[3]||match[4]);cursor=pattern.lastIndex;}
  let at=0,depth=0;
  const reference=(token:string)=>/^\$?[A-Za-z]{1,3}\$?[1-9]\d*$/.test(token);
  function primary(){
    if(++depth>64)throw Error('公式嵌套过深。');
    const token=tokens[at++];if(!token)throw Error('公式缺少内容。');
    if(token==='+'||token==='-')primary();
    else if(token==='('){expression();if(tokens[at++]!==')')throw Error('公式括号不匹配。');}
    else if(reference(token)){
      const check=(ref:string)=>{const m=ref.replace(/\$/g,'').match(/^([A-Za-z]+)(\d+)$/)!;let col=0;for(const c of m[1].toUpperCase())col=col*26+c.charCodeAt(0)-64;if(col>16384||Number(m[2])>1048576)throw Error('公式引用超出表格范围。');};check(token);
      if(tokens[at]===':'){at++;const next=tokens[at++];if(!next||!reference(next))throw Error('公式范围无效。');check(next);}
    }else if(/^[A-Za-z]+$/.test(token)){
      if(!['SUM','AVERAGE','MIN','MAX','COUNT'].includes(token.toUpperCase())||tokens[at++]!=='(')throw Error('暂不支持该公式函数或名称。');
      if(tokens[at]!==')'){expression();while(tokens[at]===','){at++;expression();}}
      if(tokens[at++]!==')')throw Error('公式函数括号不匹配。');
    }else if(!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))throw Error('公式语法不正确。');
    depth--;
  }
  function expression(){primary();while(['+','-','*','/','^'].includes(tokens[at])){at++;primary();}}
  expression();if(at!==tokens.length)throw Error('公式语法不正确。');
}
import type {ExcelValue,ExcelChange} from '../../../shared/excelEditing';
export function parseExcelInput(input:string):ExcelValue {
  if(input.length>32767)throw Error('单元格最多 32767 个字符。');
  if(input==='')return {kind:'blank'};
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(input))throw Error('单元格包含无法保存的控制字符。');
  if(input.startsWith("'"))return {kind:'text',value:input.slice(1)};
  if(input.startsWith('=')){
    const formula=input.slice(1).trim();
    if(!formula||formula.length>4096||!/^[A-Za-z0-9$()+\-*/^.,: \t]+$/.test(formula))throw Error('基础公式支持四则运算、同页单元格和 SUM/AVERAGE/MIN/MAX/COUNT；不支持外部引用。');
    for(const name of formula.matchAll(/([A-Za-z]+)\s*\(/g))if(!['SUM','AVERAGE','MIN','MAX','COUNT'].includes(name[1].toUpperCase()))throw Error('暂不支持该公式函数。');
    let depth=0;for(const char of formula){if(char==='(')depth++;if(char===')'&&--depth<0)throw Error('公式括号不匹配。');}if(depth)throw Error('公式括号不匹配。');
    validFormula(formula);return {kind:'formula',value:formula};
  }
  if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input.trim())){const value=Number(input);if(/^[+-]?\d+$/.test(input.trim())&&input.trim().replace(/^[+-]?0*/,'').length>15)return {kind:'text',value:input};if(!Number.isFinite(value))throw Error('数字超出范围。');return {kind:'number',value};}
  return {kind:'text',value:input};
}
export function excelInput(value:ExcelValue){return value.kind==='blank'?'':value.kind==='formula'?'='+value.value:value.kind==='text'?(value.value.startsWith("'")||/^[=+\-@]/.test(value.value)||/^\d/.test(value.value)?"'"+value.value:value.value):String(value.value);}
export function changeKey(sheet:string,address:string){return JSON.stringify([sheet,address]);}
export function changeSignature(changes:ExcelChange[]){return JSON.stringify([...changes].sort((a,b)=>changeKey(a.sheet,a.address).localeCompare(changeKey(b.sheet,b.address))));}
/** Excel clipboard TSV including quoted tabs/newlines and CRLF. */
export function parseTablePaste(text:string){
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
  if(rows.reduce((sum,row)=>sum+row.length,0)>10000)throw Error('一次最多粘贴 10000 个单元格。');return rows;
}
