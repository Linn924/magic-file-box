import * as XLSX from 'xlsx';
import {parseFormula,formulaReferences} from './formula';
import {contains,intersects} from '../editing/selection';
import {encloses} from '../workbook/gridBook';
function references(formula:string){try{return formulaReferences(parseFormula(formula));}catch{throw Error('选区或关联工作表含暂不支持安全移动的公式。');}}
const prefix=(sheet:string)=>"'"+sheet.replace(/'/g,"''")+"'!";
function encoded(prior:string,p:XLSX.CellAddress,maxRows:number,maxCols:number){if(p.r<0||p.c<0||p.r>=maxRows||p.c>=maxCols)throw Error('调整后的公式引用超出行列上限。');const flags=prior.match(/^(\$?)[A-Za-z]+(\$?)\d+$/)!;return flags[1]+XLSX.utils.encode_col(p.c)+flags[2]+String(p.r+1);}
export function copyFormula(formula:string,dr:number,dc:number,sheets:string[],maxRows=1048576,maxCols=16384){let result=formula;for(const ref of references(formula).reverse()){if(ref.sheet&&!sheets.some(name=>name.toLowerCase()===ref.sheet!.toLowerCase()))throw Error('目标工作簿不存在公式引用的工作表。');const original=formula.slice(ref.start,ref.end),sheetPrefix=ref.sheet?original.slice(0,original.lastIndexOf('!')+1):'';const move=(value:string)=>{const p=XLSX.utils.decode_cell(value.replace(/\$/g,'')),flags=value.match(/^(\$?)[A-Za-z]+(\$?)\d+$/)!;if(!flags[1])p.c+=dc;if(!flags[2])p.r+=dr;return encoded(value,p,maxRows,maxCols);};result=result.slice(0,ref.start)+sheetPrefix+move(ref.a)+(ref.b?':'+move(ref.b):'')+result.slice(ref.end);}return result;}
export function cutFormula(formula:string,formulaSheet:string,sourceSheet:string,source:XLSX.Range,targetSheet:string,dr:number,dc:number,movedCell:boolean,maxRows=1048576,maxCols=16384){let result=formula;for(const ref of references(formula).reverse()){
  const effective=ref.sheet||formulaSheet,range=XLSX.utils.decode_range(ref.a.replace(/\$/g,'')+(ref.b?':'+ref.b.replace(/\$/g,''):'')),inside=effective.toLowerCase()===sourceSheet.toLowerCase()&&intersects(source,range);
  if(inside&&!encloses(source,range))throw Error('剪切区域仅包含关联公式范围的一部分，不能安全移动。');
  if(!inside&&!(movedCell&&!ref.sheet&&sourceSheet!==targetSheet))continue;
  const nextSheet=inside?targetSheet:effective,unqualified=!ref.sheet&&((movedCell?targetSheet:formulaSheet).toLowerCase()===nextSheet.toLowerCase());
  const a=inside?encoded(ref.a,{r:range.s.r+dr,c:range.s.c+dc},maxRows,maxCols):ref.a,b=ref.b?(inside?encoded(ref.b,{r:range.e.r+dr,c:range.e.c+dc},maxRows,maxCols):ref.b):'';
  result=result.slice(0,ref.start)+(unqualified?'':prefix(nextSheet))+a+(b?':'+b:'')+result.slice(ref.end);
}return result;}
