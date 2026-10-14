export const codeRoles=['foreground','background','lineNumber','keyword','string','comment','number','function','type','property','search'] as const;
export type CodeRole=typeof codeRoles[number];
export interface CodePalette {colors:Partial<Record<CodeRole,string>>;styles:Partial<Record<CodeRole,number>>;}
export interface CodeAppearance {light:CodePalette;dark:CodePalette;fontFamily:string;customCss:string;}
export const CODE_CSS_LIMIT=16384;
export function defaultCodeAppearance():CodeAppearance{return {light:{colors:{},styles:{}},dark:{colors:{},styles:{}},fontFamily:'',customCss:''};}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function palette(value:unknown,base:CodePalette):CodePalette{
  if(!record(value))return structuredClone(base);
  const colors:CodePalette['colors']={},styles:CodePalette['styles']={};
  if(record(value.colors))for(const key of codeRoles){const color=value.colors[key];if(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))colors[key]=color.toLowerCase();}
  else Object.assign(colors,base.colors);
  if(record(value.styles))for(const key of codeRoles){const style=value.styles[key];if(typeof style==='number'&&Number.isInteger(style)&&style>=0&&style<=7)styles[key]=style;}
  else Object.assign(styles,base.styles);
  return {colors,styles};
}
/** Persist user appearance choices only; reject arbitrary preference fields and CSS-sized payloads. */
export function normalizeCodeAppearance(value:unknown,base=defaultCodeAppearance()):CodeAppearance{
  if(!record(value))return structuredClone(base);
  return {light:palette(value.light,base.light),dark:palette(value.dark,base.dark),
    fontFamily:typeof value.fontFamily==='string'&&value.fontFamily.length<=100&&/^[\w\u4e00-\u9fff ,"'-]*$/.test(value.fontFamily)?value.fontFamily:base.fontFamily,
    customCss:typeof value.customCss==='string'&&value.customCss.length<=CODE_CSS_LIMIT?value.customCss:base.customCss};
}
