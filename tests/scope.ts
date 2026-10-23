import type {TestContext} from './context';
export const testFormats=['word','ppt','text','image','pdf','excel'] as const;
export function formatInScope(context:TestContext,format:string){return !context.formats||context.formats.has(format);}
export function fixtureInScope(context:TestContext,name:string){
  const ext=name.split('.').at(-1)?.toLowerCase()??'';
  const format=['doc','docx'].includes(ext)?'word':['ppt','pptx'].includes(ext)?'ppt':['xls','xlsx','csv','tsv'].includes(ext)?'excel':ext==='pdf'?'pdf':['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)?'image':'text';
  return formatInScope(context,format);
}
