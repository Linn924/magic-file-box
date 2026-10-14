import {parse,generate,walk,lexer,type CssNode} from 'css-tree';
import {CODE_CSS_LIMIT,normalizeCodeAppearance,type CodeAppearance,type CodeRole} from '../../../shared/codeAppearance';
export const codeRoleNames:Record<CodeRole,string>={foreground:'默认文字',background:'代码背景',lineNumber:'行号',keyword:'关键字',string:'字符串',comment:'注释',number:'数字',function:'函数',type:'类型',property:'属性 / 标签',search:'搜索标记'};
const targets:Record<string,string>={code:':is(.text-code,.markdown pre)',token:'.syntax-token',keyword:'.tok-kw',string:'.tok-str',comment:'.tok-cmt',number:'.tok-num',function:'.tok-fn',type:'.tok-type',property:'.tok-key','line-number':'.line-no','search-hit':':is(.text-hit,.md-render-hit)'};
const roles:Record<CodeRole,string>={foreground:':is(.line-body,.markdown pre>code,.syntax-token:not(.tok-kw,.tok-str,.tok-cmt,.tok-num,.tok-fn,.tok-type,.tok-key))',background:targets.code,lineNumber:targets['line-number'],keyword:targets.keyword,string:targets.string,comment:targets.comment,number:targets.number,function:targets.function,type:targets.type,property:targets.property,search:targets['search-hit']};
const properties=new Set(['color','background-color','font-family','font-weight','font-style','text-decoration','text-decoration-color','text-decoration-line','text-decoration-style','border-color','tab-size']);
interface CustomRule {mode?:'light'|'dark';selector:string;declarations:string;}
/** Accept decorative code-only rules. Never mount the author's raw stylesheet. */
export function parseCodeCss(source:string):CustomRule[]{
  if(source.length>CODE_CSS_LIMIT)throw Error('自定义 CSS 最多 16384 字符。');
  if(!source.trim())return [];
  let ast:CssNode;
  try{ast=parse(source,{positions:true,onParseError(error){throw error;}});}catch(error){const e=error as {line?:number;column?:number};throw Error(`CSS 语法错误${e.line?'（第 '+e.line+' 行，第 '+e.column+' 列）':''}。`);}
  const colorFunctions=new Set(['rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color']);
  walk(ast,node=>{if(node.type==='Raw'||node.type==='Atrule'||node.type==='Url'||(node.type==='Function'&&!colorFunctions.has(node.name.toLowerCase())))throw Error('只支持代码区域的普通样式规则；不支持 @规则、url()、var() 或其他非颜色函数。');});
  if(ast.type!=='StyleSheet')throw Error('CSS 格式无效。');
  const rules:CustomRule[]=[];let declarations=0;
  ast.children.forEach(node=>{
    if(node.type!=='Rule'||node.prelude?.type!=='SelectorList')throw Error('只支持普通 CSS 规则。');
    let body='';node.block.children.forEach(item=>{
      if(item.type!=='Declaration'||!properties.has(item.property.toLowerCase()))throw Error('不支持该属性；可设置颜色、字体、文字装饰、边框颜色和 tab-size。');
      const property=item.property.toLowerCase();if(++declarations>128)throw Error('自定义 CSS 最多 128 个样式属性。');
      if(lexer.matchProperty(property,item.value).error)throw Error('CSS 属性值无效：'+property+'。');
      const value=generate(item.value);
      if(property==='tab-size'&&!/^[1-8]$/.test(value))throw Error('tab-size 仅支持 1–8。');
      body+=property+':'+value+' !important;';
    });
    node.prelude.children.forEach(selector=>{
      const text=generate(selector),match=text.match(/^(?:\.(light|dark)\s+)?(?:\.code\s+)?\.([\w-]+)$/);
      if(!match||!Object.hasOwn(targets,match[2]))throw Error('选择器只支持 .code、.token、.keyword、.string、.comment、.number、.function、.type、.property、.line-number、.search-hit；可加 .light / .dark 前缀。');
      if(rules.length>=64)throw Error('自定义 CSS 最多 64 个选择器。');
      rules.push({mode:match[1] as CustomRule['mode'],selector:targets[match[2]],declarations:body});
    });
  });return rules;
}
export function appearanceCss(value:CodeAppearance,scope='.text[data-code-appearance]',preview=false){
  const settings=normalizeCodeAppearance(value),out:string[]=[];
  if(value?.fontFamily!==undefined&&value.fontFamily!==settings.fontFamily)throw Error('代码字体格式无效，请填写本机字体名称。');
  if(settings.fontFamily){try{const family=parse(settings.fontFamily,{context:'value',onParseError(error){throw error;}});if(lexer.matchProperty('font-family',family).error)throw Error();}catch{throw Error('代码字体格式无效，请用逗号分隔本机字体名称。');}}
  const root=(mode:'light'|'dark')=>preview?`${scope}[data-code-mode="${mode}"]`:`html[data-theme="${mode}"] ${scope}`;
  if(preview)for(const mode of ['light','dark'] as const)out.push(`${root(mode)} :is(.text-hit,.md-render-hit){background-color:${mode==='dark'?'#854d0e':'#fde68a'};color:${mode==='dark'?'#fff':'inherit'};}\n${root(mode)} .text-line:hover{background-color:transparent;}`);
  for(const mode of ['light','dark'] as const){
    for(const [key,color] of Object.entries(settings[mode].colors)){const role=key as CodeRole;out.push(`${root(mode)} ${roles[role]}{${role==='background'||role==='search'?'background-color':'color'}:${color};}`);if(role==='background')out.push(`${root(mode)} .text-line:hover{background-color:transparent;}`);}
    for(const [key,flags] of Object.entries(settings[mode].styles))out.push(`${root(mode)} ${roles[key as CodeRole]}{font-style:${flags!&1?'italic':'normal'};font-weight:${flags!&2?'bold':'normal'};text-decoration-line:${flags!&4?'underline':'none'};}`);
    if(settings.fontFamily)out.push(`${root(mode)} :is(.text-code,.line-body,.markdown pre,.markdown pre>code,.syntax-token){font-family:${settings.fontFamily};}`);
  }
  const custom=parseCodeCss(value?.customCss??'');
  for(const rule of custom)for(const mode of rule.mode?[rule.mode]:['light','dark'] as const)out.push(`${root(mode)} ${rule.selector}{${rule.declarations}}`);
  return out.join('\n');
}
