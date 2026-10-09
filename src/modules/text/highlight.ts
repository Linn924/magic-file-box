type Token={start:number;end:number;kind?:string};
const escapeHtml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
export function textMatches(line:string,query:string):Array<{start:number;end:number}> {
  const q=query.trim();if(!q)return [];
  const escaped=Array.from(q,char=>'\\^$.*+?()[]{}|'.includes(char)?'\\'+char:char).join('');
  const regex=new RegExp(escaped,'gi');
  return Array.from(line.matchAll(regex),match=>({start:match.index!,end:match.index!+match[0].length}));
}
/** Tokenize source once, then merge source ranges; never replace generated markup. */
export function renderTextLine(line:string,ext:string,query='') {
  const parts=tokens(line,ext),matches=textMatches(line,query),html:string[]=[];
  let pos=0,token=0,hit=0;
  while(pos<line.length){
    while(parts[token].end<=pos)token++;
    while(hit<matches.length&&matches[hit].end<=pos)hit++;
    const match=matches[hit],active=!!match&&match.start<=pos;
    const end=Math.min(parts[token].end,match?(active?match.end:match.start):line.length);
    let piece=escapeHtml(line.slice(pos,end));
    if(active)piece='<mark class="text-hit">'+piece+'</mark>';
    if(parts[token].kind)piece='<span class="'+parts[token].kind+'">'+piece+'</span>';
    html.push(piece);pos=end;
  }
  return html.join('');
}
