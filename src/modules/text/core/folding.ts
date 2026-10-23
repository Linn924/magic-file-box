import type {SyntaxData} from './syntaxTypes';
export interface FoldRange {start:number;end:number}
/** Fold only syntax-recognized source; strings and comments never contribute structural delimiters. */
export function codeFolds(lines:string[],syntax:SyntaxData|undefined,language:string|undefined):FoldRange[]{
  if(!syntax||lines.length>50000)return [];
  const ranges=new Map<number,number>(),stack:Array<{char:string;line:number}>=[],tags:Array<{name:string;line:number}>=[];
  const add=(start:number,end:number)=>{if(end>start)ranges.set(start,Math.max(end,ranges.get(start)??start));};
  const masked=lines.map((line,i)=>{
    const chars=line.split('');
    for(const [start,end,style] of syntax.lines[i]??[])if(['tok-str','tok-cmt'].includes(syntax.styles[style]?.kind))for(let at=start;at<end;at++)chars[at]=' ';
    return chars.join('');
  });
  const markup=['xml','html','vue','jsx','tsx'].includes(language??'');
  const braces=['javascript','typescript','jsx','tsx','json','jsonc','json5','c','cpp','csharp','java','go','rust','css','scss','less','powershell','vue'].includes(language??'');
  let comment=-1;
  for(let i=0;i<lines.length;i++){
    const line=masked[i];
    const parts=syntax.lines[i]??[],onlyComment=parts.some(part=>syntax.styles[part[2]]?.kind==='tok-cmt')&&parts.every(([start,end,style])=>syntax.styles[style]?.kind==='tok-cmt'||!lines[i].slice(start,end).trim());
    if(onlyComment||(comment>=0&&!lines[i].trim())){if(comment<0)comment=i;}else if(comment>=0){add(comment,i-1);comment=-1;}
    if(braces)for(const char of line){
      if(char==='{'||char==='[')stack.push({char,line:i});
      else if(char==='}'||char===']'){const open=stack.at(-1);if(open?.char===(char==='}'?'{':'[')){stack.pop();add(open.line,i);}else stack.length=0;}
    }
    if(markup)for(const match of line.matchAll(/<(\/?)([\w:.-]+)\b[^>]*>/g)){
      const name=match[2].toLowerCase();
      if(match[1]){const at=tags.map(tag=>tag.name).lastIndexOf(name);if(at>=0){add(tags[at].line,i);tags.splice(at);}}
      else if(!/\/\s*>$/.test(match[0])&&!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(name))tags.push({name,line:i});
    }
  }
  if(comment>=0)add(comment,lines.length-1);
  if(language==='python'||language==='yaml'){
    const blocks:Array<{line:number;indent:number}>=[];let last=0;
    for(let i=0;i<masked.length;i++){
      const line=masked[i];if(!line.trim())continue;
      const indent=(line.match(/^\s*/)?.[0]??'').replace(/\t/g,'        ').length;
      while(blocks.length&&indent<=blocks.at(-1)!.indent){const open=blocks.pop()!;add(open.line,last);}
      if(line.trimEnd().endsWith(':'))blocks.push({line:i,indent});last=i;
    }
    for(const block of blocks)add(block.line,last);
  }
  if(language==='markdown'){
    const headings:Array<{line:number;level:number}>=[];let fence:{line:number;char:string;length:number}|undefined;
    for(let i=0;i<lines.length;i++){
      const block=lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if(fence){
        if(block&&block[1][0]===fence.char&&block[1].length>=fence.length&&!block[2].trim()){add(fence.line,i);fence=undefined;}
        continue;
      }
      if(block&&!(block[1][0]==='`'&&block[2].includes('`'))){fence={line:i,char:block[1][0],length:block[1].length};continue;}
      const heading=lines[i].match(/^ {0,3}(#{1,6})(?:[ \t]+|$)/);if(!heading)continue;
      while(headings.length&&headings.at(-1)!.level>=heading[1].length){const open=headings.pop()!;add(open.line,i-1);}
      headings.push({line:i,level:heading[1].length});
    }
    if(fence)add(fence.line,lines.length-1);
    for(const heading of headings)add(heading.line,lines.length-1);
  }
  return [...ranges].map(([start,end])=>({start,end})).sort((a,b)=>a.start-b.start);
}
