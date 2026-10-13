import {formulaFunctions} from './formula';
export const parameters:Record<string,string[]>={VLOOKUP:['查找值','首列查找区域','返回列号','近似匹配（FALSE 为精确）'],ROUND:['数值','小数位数'],ROUNDUP:['数值','小数位数'],ROUNDDOWN:['数值','小数位数'],ABS:['数值'],IF:['条件','成立时','不成立时'],SUM:['数值或区域…'],AVERAGE:['数值或区域…'],MIN:['数值或区域…'],MAX:['数值或区域…'],COUNT:['数值或区域…'],COUNTA:['值或区域…']};
/** Mask literals while retaining offsets. Unclosed strings stay masked during typing. */
function mask(text:string,maskSheets=false){let output='',quoted=false,sheet=false;for(let i=0;i<text.length;i++){const char=text[i];if(sheet){output+=maskSheets?' ':char;if(char==="'"){if(text[i+1]==="'"){output+=maskSheets?' ':text[i+1];i++;}else sheet=false;}continue;}if(char==='"'){if(quoted&&text[i+1]==='"'){output+='  ';i++;continue;}quoted=!quoted;output+=' ';}else if(quoted)output+=' ';else {if(char==="'")sheet=true;output+=sheet&&maskSheets?' ':char;}}return {text:output,quoted:quoted||sheet};}
export function assistContext(text:string,start:number,end=start){
  const before=mask(text.slice(0,start),true),word=before.text.match(/(?:^|[=(,+\-*/^&<>])\s*([A-Za-z_]+)$/),prefix=word?.[1]||'';
  const suggestions=text.startsWith('=')&&!before.quoted&&start===end&&prefix?formulaFunctions.filter(fn=>fn.name.startsWith(prefix.toUpperCase())):[];
  const stack:Array<{name:string;argument:number}>=[];let name='';for(const ch of before.text){if(/[A-Za-z_]/.test(ch))name+=ch;else if(ch==='('){stack.push({name:name.toUpperCase(),argument:0});name='';}else if(ch===')'){stack.pop();name='';}else if(ch===','){if(stack.length)stack.at(-1)!.argument++;name='';}else if(!/\s/.test(ch))name='';}
  const call=[...stack].reverse().find(item=>parameters[item.name]);
  return {suggestions,prefix,start:start-prefix.length,call};
}
export function assistReferences(text:string){
  if(!text.startsWith('='))return [];
  const clean=mask(text).text,pattern=/(?<![A-Za-z0-9_])(?:(?:'((?:[^']|'')+)'|([A-Za-z_\u0080-\uFFFF][A-Za-z0-9_.\u0080-\uFFFF]*))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d*)(?::(\$?[A-Za-z]{1,3}\$?[1-9]\d*))?(?![A-Za-z0-9_!])/g;
  return [...clean.matchAll(pattern)].map(m=>({sheet:m[1]?.replace(/''/g,"'")||m[2],range:m[3].replace(/\$/g,'')+(m[4]?':'+m[4].replace(/\$/g,''):''),start:m.index!,end:m.index!+m[0].length}));
}
export function referenceSlot(text:string,start:number,end:number){
  if(!text.startsWith('=')||mask(text.slice(0,start)).quoted)return;
  const ref=assistReferences(text).find(r=>start>=r.start&&end<=r.end);if(ref)return {start:ref.start,end:ref.end};
  if(start===end&&/[=(,+\-*/^&<>]\s*$/.test(mask(text.slice(0,start)).text))return {start,end};
}
