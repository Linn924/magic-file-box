type Token={start:number;end:number;kind?:string};
import type {SyntaxData,SyntaxPart} from './syntaxTypes';
import {textMatches} from '@/utils/renderedSearch';
export {textMatches} from '@/utils/renderedSearch';
const escapeHtml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;');
const quoted=String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60`;
function tokens(line:string,ext:string):Token[] {
  let pattern:RegExp|undefined;
  if(ext==='json')pattern=/"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
  else if(ext==='js'||ext==='ts')pattern=new RegExp(String.raw`\/\/.*$|\/\*.*?\*\/|${quoted}|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|type|interface|new|try|catch|typeof)\b|\b\d+(?:\.\d+)?\b`,'g');
  else if(ext==='xml')pattern=/<\/?[\w:.-]+|"[^"]*"/g;
  else if(ext==='css')pattern=new RegExp(String.raw`\/\*.*?\*\/|${quoted}|#[0-9a-fA-F]{3,8}\b|[.#][\w-]+|[\w-]+(?=\s*:)|\b\d+(?:\.\d+)?\b`,'g');
  else if(ext==='toml'||ext==='ini')pattern=new RegExp(String.raw`^\s*[#;].*$|^\s*\[\[?[^\]]+\]?\]|${quoted}|^\s*[\w.-]+(?=\s*=)|\b(?:true|false)\b|-?\b\d+(?:\.\d+)?\b`,'g');
  else if(ext==='yaml'||ext==='yml')pattern=new RegExp(String.raw`^\s*#.*$|${quoted}|[\w.-]+(?=:)|\b(?:true|false|null)\b`,'g');
  else if(ext==='log')pattern=/\b(?:ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\b/g;
  if(!pattern)return [{start:0,end:line.length}];
  const out:Token[]=[];let cursor=0;
  for(const match of line.matchAll(pattern)){
    const start=match.index!,value=match[0];if(start>cursor)out.push({start:cursor,end:start});
    let kind='tok-kw';
    if(/^(\/\/|\/\*|\s*[#;])/.test(value)&&!(ext==='css'&&value.trim().startsWith('#')))kind='tok-cmt';
    else if(/^["'`]/.test(value))kind=ext==='json'&&/^\s*:/.test(line.slice(start+value.length))?'tok-key':'tok-str';
    else if(/^-?\d/.test(value)||(ext==='css'&&/^#[0-9a-fA-F]{3,8}$/.test(value)))kind='tok-num';
    else if(['xml','css','ini','toml','yaml','yml'].includes(ext)&&!['true','false','null'].includes(value))kind='tok-key';
    cursor=start+value.length;out.push({start,end:cursor,kind});
  }
  if(cursor<line.length)out.push({start:cursor,end:line.length});return out;
}
/** Tokenize source once, then merge source ranges; never replace generated markup. */
export function renderTextLine(line:string,ext:string,query='',currentStart=-1) {
  const parts=tokens(line,ext),matches=textMatches(line,query),html:string[]=[];
  let pos=0,token=0,hit=0;
  while(pos<line.length){
    while(parts[token].end<=pos)token++;
    while(hit<matches.length&&matches[hit].end<=pos)hit++;
    const match=matches[hit],active=!!match&&match.start<=pos;
    const end=Math.min(parts[token].end,match?(active?match.end:match.start):line.length);
    let piece=escapeHtml(line.slice(pos,end));
    if(active)piece='<mark class="text-hit'+(match.start===currentStart?' text-current-hit':'')+'" data-hit-start="'+match.start+'">'+piece+'</mark>';
    if(parts[token].kind)piece='<span class="'+parts[token].kind+'">'+piece+'</span>';
    html.push(piece);pos=end;
  }
  return html.join('');
}
/** Merge token and search ranges over original characters; author HTML stays escaped. */
export function renderSyntaxLine(line:string,parts:SyntaxPart[]|undefined,styles:SyntaxData['styles'],query='',currentStart=-1){
  if(!parts?.length)return renderTextLine(line,'',query,currentStart);const matches=textMatches(line,query),html:string[]=[];let at=0,token=0,hit=0;
  while(at<line.length){while(token<parts.length&&parts[token][1]<=at)token++;while(hit<matches.length&&matches[hit].end<=at)hit++;const part=parts[token],style=part&&part[0]<=at?styles[part[2]]:undefined,match=matches[hit],active=!!match&&match.start<=at;
    const end=Math.min(line.length,part?(style?part[1]:part[0]):line.length,match?(active?match.end:match.start):line.length);if(end<=at)return renderTextLine(line,'',query,currentStart);
    let text=escapeHtml(line.slice(at,end));if(active)text='<mark class="text-hit'+(match.start===currentStart?' text-current-hit':'')+'" data-hit-start="'+match.start+'">'+text+'</mark>';
    if(style){
      text=`<span class="syntax-token ${style.kind}" style="--syntax-light:${style.light};--syntax-dark:${style.dark};--syntax-l-italic:${style.lightFont&1?'italic':'normal'};--syntax-d-italic:${style.darkFont&1?'italic':'normal'};--syntax-l-weight:${style.lightFont&2?'bold':'normal'};--syntax-d-weight:${style.darkFont&2?'bold':'normal'};--syntax-l-line:${style.lightFont&4?'underline':'none'};--syntax-d-line:${style.darkFont&4?'underline':'none'}">${text}</span>`;}
    html.push(text);at=end;
  }return html.join('');
}
