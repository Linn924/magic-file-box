import * as XLSX from 'xlsx';
import type {ExcelChange} from '@shared/excelEditing';
export const formulaFunctions=[
  {name:'VLOOKUP',label:'纵向查找',example:'=VLOOKUP(A2,A2:B10,2,FALSE)',min:3,max:4},
  {name:'ROUND',label:'四舍五入',example:'=ROUND(A1,2)',min:2,max:2},
  {name:'ROUNDUP',label:'远离零取整',example:'=ROUNDUP(A1,2)',min:2,max:2},
  {name:'ROUNDDOWN',label:'向零取整',example:'=ROUNDDOWN(A1,2)',min:2,max:2},
  {name:'SUM',label:'求和',example:'=SUM(A1:A10)',min:1,max:255},
  {name:'AVERAGE',label:'平均值',example:'=AVERAGE(A1:A10)',min:1,max:255},
  {name:'MIN',label:'最小值',example:'=MIN(A1:A10)',min:1,max:255},
  {name:'MAX',label:'最大值',example:'=MAX(A1:A10)',min:1,max:255},
  {name:'COUNT',label:'数字计数',example:'=COUNT(A1:A10)',min:1,max:255},
  {name:'COUNTA',label:'非空计数',example:'=COUNTA(A1:A10)',min:1,max:255},
  {name:'ABS',label:'绝对值',example:'=ABS(A1)',min:1,max:1},
  {name:'IF',label:'条件判断',example:'=IF(A1>0,"是","否")',min:2,max:3},
] as const;
type Scalar=number|string|boolean|null;
export type CalcError='#NULL!'|'#REF!'|'#DIV/0!'|'#N/A'|'#VALUE!'|'#NAME?'|'#NUM!'|'#CYCLE!'|'#LIMIT!'|'#UNSUPPORTED!';
type Token={text:string;start:number;end:number;kind:'word'|'number'|'string'|'sheet'|'error'|'op'};
export type FormulaNode={type:'literal';value:Scalar}|{type:'error';error:CalcError}|{type:'ref';sheet?:string;a:string;b?:string;start:number;end:number}|{type:'unary';op:string;value:FormulaNode}|{type:'binary';op:string;left:FormulaNode;right:FormulaNode}|{type:'call';name:string;args:FormulaNode[]};
function lex(source:string){const tokens:Token[]=[];let at=0;while(at<source.length){if(/\s/.test(source[at])){at++;continue;}const start=at,rest=source.slice(at);let match:RegExpMatchArray|null,kind:Token['kind'];
  if((match=rest.match(/^"(?:[^"]|"")*"/)))kind='string';
  else if((match=rest.match(/^'(?:[^']|'')*'/)))kind='sheet';
  else if((match=rest.match(/^#(?:REF!|DIV\/0!|N\/A|VALUE!|NAME\?|NUM!|NULL!)/i)))kind='error';
  else if((match=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)))kind='number';
  else if((match=rest.match(/^(?:\$?[A-Za-z]{1,3}\$?[1-9]\d*|[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_.\u0080-\uFFFF]*)(?![A-Za-z0-9_])/)))kind='word';
  else if((match=rest.match(/^(?:<=|>=|<>|[()+\-*/^&%=<>!:,])/)))kind='op';
  else throw Error('公式包含不支持的语法；不支持外部工作簿或数组引用。');
  at+=match[0].length;tokens.push({text:match[0],kind,start,end:at});if(tokens.length>2048)throw Error('公式过于复杂。');
}return tokens;}
function validAddress(address:string){if(!/^\$?[A-Za-z]{1,3}\$?[1-9]\d*$/.test(address))throw Error('单元格引用无效。');const pos=XLSX.utils.decode_cell(address.replace(/\$/g,''));if(pos.c>=16384||pos.r>=1048576)throw Error('公式引用超出表格范围。');}
export function parseFormula(source:string,strict=true):FormulaNode{
  if(!source.trim()||source.length>4096)throw Error('公式须包含内容，最多 4096 字符。');const tokens=lex(source);let at=0,depth=0;
  const take=()=>tokens[at++],peek=(text:string)=>tokens[at]?.text===text,expect=(text:string)=>{if(!peek(text))throw Error('公式缺少 '+text+'。');at++;};
  function primary():FormulaNode{if(++depth>64)throw Error('公式嵌套过深。');const token=take();if(!token)throw Error('公式缺少内容。');let node:FormulaNode;
    if(token.kind==='number'){const value=Number(token.text);if(!Number.isFinite(value))throw Error('公式数字超出范围。');node={type:'literal',value};}
    else if(token.kind==='string')node={type:'literal',value:token.text.slice(1,-1).replace(/""/g,'"')};
    else if(token.kind==='error')node={type:'error',error:token.text.toUpperCase() as CalcError};
    else if(token.text==='('){node=expression(0);expect(')');}
    else if(token.text==='+'||token.text==='-')node={type:'unary',op:token.text,value:primary()};
    else if(token.kind==='word'||token.kind==='sheet'){
      if(peek('(')){const name=token.text.toUpperCase();if(strict&&!formulaFunctions.some(fn=>fn.name===name))throw Error('暂不支持函数 '+name+'。');take();const args:FormulaNode[]=[];if(!peek(')')){args.push(expression(0));while(peek(',')){take();args.push(expression(0));}}expect(')');const spec=formulaFunctions.find(fn=>fn.name===name);if(strict&&spec&&(args.length<spec.min||args.length>spec.max))throw Error(name+' 参数数量不正确。');node={type:'call',name,args};}
      else if(!peek('!')&&['TRUE','FALSE'].includes(token.text.toUpperCase()))node={type:'literal',value:token.text.toUpperCase()==='TRUE'};
      else {let sheet:string|undefined,cell=token;if(peek('!')){take();sheet=token.kind==='sheet'?token.text.slice(1,-1).replace(/''/g,"'"):token.text;cell=take();if(!cell)throw Error('缺少单元格引用。');}
        if(cell.kind==='error')node={type:'error',error:cell.text.toUpperCase() as CalcError};
        else {validAddress(cell.text);let b:string|undefined,end=cell.end;if(peek(':')){take();let last=take();if(!last)throw Error('区域引用不完整。');if(peek('!')){take();const second=last.kind==='sheet'?last.text.slice(1,-1).replace(/''/g,"'"):last.text;if(!sheet||second.toLowerCase()!==sheet.toLowerCase())throw Error('不支持跨工作表区域。');last=take();if(!last)throw Error('区域引用不完整。');}validAddress(last.text);b=last.text;end=last.end;}node={type:'ref',sheet,a:cell.text,b,start:token.start,end};}
      }
    }else throw Error('公式语法不正确。');
    depth--;while(peek('%')){take();node={type:'unary',op:'%',value:node};}return node;
  }
  const precedence:Record<string,number>={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5};
  function expression(min:number):FormulaNode{let node=primary();while(tokens[at]&&precedence[tokens[at].text]>=min){const op=take().text;node={type:'binary',op,left:node,right:expression(precedence[op]+1)};}return node;}
  const result=expression(0);if(at!==tokens.length)throw Error('公式语法不正确。');return result;
}
export function formulaReferences(node:FormulaNode):Extract<FormulaNode,{type:'ref'}>[]{if(node.type==='ref')return [node];if(node.type==='call')return node.args.flatMap(formulaReferences);if(node.type==='binary')return [...formulaReferences(node.left),...formulaReferences(node.right)];if(node.type==='unary')return formulaReferences(node.value);return [];}
class Fault extends Error{constructor(public code:CalcError){super(code);}}
const fault=(code:CalcError):never=>{throw new Fault(code);};
type Reference=Extract<FormulaNode,{type:'ref'}>;
type Value=Scalar|Reference;
export type FormulaResult={value:Scalar;error?:undefined}|{error:CalcError;value?:undefined};
export function roundValue(value:number,digits:number,mode='ROUND'){
  digits=Math.trunc(digits);if(!Number.isFinite(value)||Math.abs(digits)>308)return fault('#NUM!');if(value===0)return 0;
  const [mantissa,exponent='0']=Math.abs(value).toPrecision(15).split('e'),shift=Number(exponent)+digits;
  const shifted=Number(mantissa+'e'+shift);if(!Number.isFinite(shifted))return value;if(shifted===0)return mode==='ROUNDUP'?Math.sign(value)*10**(-digits):0;
  const integer=mode==='ROUNDDOWN'?Math.floor(shifted):mode==='ROUNDUP'?Math.ceil(shifted):Math.floor(shifted+.5);
  const [whole,power='0']=String(integer).split('e');const result=Math.sign(value)*Number(whole+'e'+(Number(power)-digits));if(!Number.isFinite(result))return fault('#NUM!');return Object.is(result,-0)?0:result;
}
export function createFormulaCalculator(book:XLSX.WorkBook,changes:ExcelChange[]=[]){
  const patches=new Map(changes.filter(change=>!change.alignmentOnly).map(change=>[JSON.stringify([change.sheet,change.address]),change.value]));
  const cache=new Map<string,FormulaResult>(),pending=new Set<string>();let steps=0,started=0;
  function tick(){if(++steps>100000||steps%256===0&&Date.now()-started>100)return fault('#LIMIT!');}
  function resolveSheet(name:string){return book.SheetNames.find(sheet=>sheet.toLowerCase()===name.toLowerCase())??fault('#REF!');}
  function cell(sheet:string,address:string,depth=0):Scalar{
    tick();if(depth>128)return fault('#LIMIT!');sheet=resolveSheet(sheet);address=address.replace(/\$/g,'').toUpperCase();const key=JSON.stringify([sheet,address]),prior=cache.get(key);if(prior){if(prior.error)return fault(prior.error);return prior.value;}
    if(pending.has(key))return fault('#CYCLE!');pending.add(key);let result:FormulaResult;
    try{const patch=patches.get(key),original=book.Sheets[sheet][address];const formula=patch?.kind==='formula'?patch.value:!patch?original?.f:undefined;
      let value:Scalar;if(formula){let ast:FormulaNode;try{ast=parseFormula(formula,false);}catch{return fault('#UNSUPPORTED!');}value=scalar(evaluate(ast,sheet,depth+1),sheet,depth+1)??0;}
      else if(patch)value=patch.kind==='blank'?null:patch.value;
      else if(!original||original.t==='z')value=null;else if(original.t==='e')return fault(({0:'#NULL!',7:'#DIV/0!',15:'#VALUE!',23:'#REF!',29:'#NAME?',36:'#NUM!',42:'#N/A'} as Record<number,CalcError>)[original.v]||'#VALUE!');else value=original.v??null;
      if(typeof value==='number'&&!Number.isFinite(value))return fault('#NUM!');result={value};
    }catch(e){result={error:e instanceof Fault?e.code:'#UNSUPPORTED!'};}finally{pending.delete(key);}
    if(result.error!=='#LIMIT!'){if(cache.size>=50000)cache.delete(cache.keys().next().value!);cache.set(key,result);}if(result.error)return fault(result.error);return result.value;
  }
  function scalar(value:Value,sheet:string,depth:number):Scalar{if(value&&typeof value==='object'){if(value.b&&value.a.replace(/\$/g,'')!==value.b.replace(/\$/g,''))return fault('#VALUE!');return cell(value.sheet||sheet,value.a,depth);}return value as Scalar;}
  function numeric(value:Value,sheet:string,depth:number){const item=scalar(value,sheet,depth);if(item===null||item==='')return 0;if(typeof item==='boolean')return Number(item);if(typeof item==='number')return item;const result=Number(item);return Number.isFinite(result)&&item.trim()?result:fault('#VALUE!');}
  function truth(value:Value,sheet:string,depth:number){const item=scalar(value,sheet,depth);if(typeof item==='string'){if(item.toUpperCase()==='TRUE')return true;if(item.toUpperCase()==='FALSE')return false;return fault('#VALUE!');}return !!item;}
  function range(ref:Reference){const a=XLSX.utils.decode_cell(ref.a.replace(/\$/g,'')),b=XLSX.utils.decode_cell((ref.b||ref.a).replace(/\$/g,''));return {s:{r:Math.min(a.r,b.r),c:Math.min(a.c,b.c)},e:{r:Math.max(a.r,b.r),c:Math.max(a.c,b.c)}};}
  function compare(a:Scalar,b:Scalar){if(a===null)a=typeof b==='string'?'':0;if(b===null)b=typeof a==='string'?'':0;const rank=(value:Scalar)=>typeof value==='boolean'?2:typeof value==='string'?1:0;const ar=rank(a),br=rank(b);if(ar!==br)return ar-br;if(typeof a==='string'&&typeof b==='string'){a=a.toLowerCase();b=b.toLowerCase();}return a===b?0:(a as any)<(b as any)?-1:1;}
  function wildcard(pattern:string){const tokens:Array<{value:string;wild:boolean}>=[];for(let i=0;i<pattern.length;i++){const c=pattern[i];if(c==='~'&&i+1<pattern.length)tokens.push({value:pattern[++i].toLowerCase(),wild:false});else tokens.push({value:c.toLowerCase(),wild:c==='*'||c==='?'});}return {test(text:string){text=text.toLowerCase();let i=0,j=0,star=-1,retry=0;while(i<text.length){tick();const token=tokens[j];if(token&&(token.wild&&token.value==='?'||!token.wild&&token.value===text[i])){i++;j++;}else if(token?.wild&&token.value==='*'){star=j++;retry=i;}else if(star>=0){j=star+1;i=++retry;}else return false;}while(tokens[j]?.wild&&tokens[j].value==='*')j++;return j===tokens.length;}};}
  function evaluate(node:FormulaNode,sheet:string,depth:number):Value{
    tick();if(node.type==='literal')return node.value;if(node.type==='error')return fault(node.error);if(node.type==='ref')return node;
    if(node.type==='unary'){const n=numeric(evaluate(node.value,sheet,depth),sheet,depth);return node.op==='-'?-n:node.op==='%'?n/100:n;}
    if(node.type==='binary'){const left=evaluate(node.left,sheet,depth),right=evaluate(node.right,sheet,depth);if(node.op==='&'){const text=(v:Scalar)=>typeof v==='boolean'?(v?'TRUE':'FALSE'):String(v??'');return text(scalar(left,sheet,depth))+text(scalar(right,sheet,depth));}if(['=','<>','<','>','<=','>='].includes(node.op)){const c=compare(scalar(left,sheet,depth),scalar(right,sheet,depth));return node.op==='='?c===0:node.op==='<>'?c!==0:node.op==='<'?c<0:node.op==='>'?c>0:node.op==='<='?c<=0:c>=0;}const a=numeric(left,sheet,depth),b=numeric(right,sheet,depth);if(node.op==='/'&&b===0)return fault('#DIV/0!');const value=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:node.op==='/'?a/b:a**b;return Number.isFinite(value)?value:fault('#NUM!');}
    const fn=formulaFunctions.find(fn=>fn.name===node.name);if(!fn)return fault('#UNSUPPORTED!');if(node.args.length<fn.min||node.args.length>fn.max)return fault('#VALUE!');
    if(node.name==='IF')return truth(evaluate(node.args[0],sheet,depth),sheet,depth)?evaluate(node.args[1],sheet,depth):node.args[2]?evaluate(node.args[2],sheet,depth):false;
    if(['ROUND','ROUNDUP','ROUNDDOWN','ABS'].includes(node.name)){const value=numeric(evaluate(node.args[0],sheet,depth),sheet,depth);return node.name==='ABS'?Math.abs(value):roundValue(value,numeric(evaluate(node.args[1],sheet,depth),sheet,depth),node.name);}
    if(node.name==='VLOOKUP'){
      const lookup=scalar(evaluate(node.args[0],sheet,depth),sheet,depth)??0,table=evaluate(node.args[1],sheet,depth),col=Math.trunc(numeric(evaluate(node.args[2],sheet,depth),sheet,depth)),approx=node.args[3]?truth(evaluate(node.args[3],sheet,depth),sheet,depth):true;
      if(!table||typeof table!=='object')return fault('#VALUE!');const bounds=range(table),target=resolveSheet(table.sheet||sheet);if(col<1)return fault('#VALUE!');if(col>bounds.e.c-bounds.s.c+1)return fault('#REF!');if(bounds.e.r-bounds.s.r+1>100000)return fault('#LIMIT!');
      let found=-1;const match=typeof lookup==='string'&&!approx?wildcard(lookup):undefined;for(let r=bounds.s.r;r<=bounds.e.r;r++){const value=cell(target,XLSX.utils.encode_cell({r,c:bounds.s.c}),depth+1);if(!approx){if(match?typeof value==='string'&&match.test(value):compare(value,lookup)===0){found=r;break;}}else if(typeof value===typeof lookup||value===null){if(compare(value,lookup)<=0)found=r;else break;}}
      return found<0?fault('#N/A'):cell(target,XLSX.utils.encode_cell({r:found,c:bounds.s.c+col-1}),depth+1)??0;
    }
    let count=0,total=0,min=Infinity,max=-Infinity,nonempty=0;
    const accumulate=(item:Scalar,indirect:boolean)=>{if(item!==null)nonempty++;let n:number|undefined;if(typeof item==='number')n=item;else if(!indirect&&item!==null){if(typeof item==='boolean')n=Number(item);else if(item.trim()&&Number.isFinite(Number(item)))n=Number(item);else if(!['COUNT','COUNTA'].includes(node.name))return fault('#VALUE!');}if(n!==undefined){count++;total+=n;min=Math.min(min,n);max=Math.max(max,n);}};
    const counted=(read:()=>Scalar,indirect:boolean)=>{try{accumulate(read(),indirect);}catch(e){if(e instanceof Fault&&!['#CYCLE!','#LIMIT!','#UNSUPPORTED!'].includes(e.code)&&(node.name==='COUNTA'||node.name==='COUNT'&&indirect)){if(node.name==='COUNTA')nonempty++;}else throw e;}};
    for(const arg of node.args){let value:Value;try{value=evaluate(arg,sheet,depth);}catch(e){if(node.name==='COUNTA'&&e instanceof Fault&&!['#CYCLE!','#LIMIT!','#UNSUPPORTED!'].includes(e.code)){nonempty++;continue;}throw e;}if(value&&typeof value==='object'){const bounds=range(value);if((bounds.e.r-bounds.s.r+1)*(bounds.e.c-bounds.s.c+1)>100000)return fault('#LIMIT!');for(let r=bounds.s.r;r<=bounds.e.r;r++)for(let c=bounds.s.c;c<=bounds.e.c;c++)counted(()=>cell(value.sheet||sheet,XLSX.utils.encode_cell({r,c}),depth+1),true);}else counted(()=>value as Scalar,false);}
    return node.name==='COUNTA'?nonempty:node.name==='COUNT'?count:node.name==='AVERAGE'?(count?total/count:fault('#DIV/0!')):node.name==='MIN'?(count?min:0):node.name==='MAX'?(count?max:0):total;
  }
  function result(sheet:string,address:string,reset=true):FormulaResult{if(reset){steps=0;started=Date.now();}try{return {value:cell(sheet,address)};}catch(e){return {error:e instanceof Fault?e.code:'#UNSUPPORTED!'};}}
  return {result,beginBatch(){steps=0;started=Date.now();}};
}
