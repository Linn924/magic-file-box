export type SearchMode = 'plain' | 'wildcard' | 'regex';
export interface SearchOptions { caseSensitive:boolean; mode:SearchMode }
export interface TextMatch { charOffset:number; length:number }
/** Preserve original offsets when Unicode case conversion changes string length. */
export function foldPdfText(source:string) {
  const folded=source.toLowerCase();
  if(folded.length===source.length)return {folded,offsets:undefined as number[]|undefined};
  const offsets:number[]=[];let position=0;
  for(const char of source) { const lower=char.toLowerCase();for(let i=0;i<lower.length;i++)offsets.push(position);position+=char.length; }
  offsets.push(source.length);return {folded,offsets};
}
export function searchPattern(query:string,mode:SearchMode) {
  if(query.length>512)throw Error('搜索表达式最多 512 个字符。');
  if(mode==='regex')return query;
  return Array.from(query,char=>mode==='wildcard'&&char==='*'?'[^\\r\\n]*?':mode==='wildcard'&&char==='?'?'[^\\r\\n]':char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');
}
export const MAX_SEARCH_HITS=50000;
/** Pattern searches run in an interruptible worker, never on the UI thread. */
export function findPdfMatches(text:string,query:string,options:SearchOptions,limit=MAX_SEARCH_HITS):TextMatch[] {
  const found:TextMatch[]=[];
  if(options.mode==='plain') {
    const {folded,offsets}=options.caseSensitive?{folded:text,offsets:undefined}:foldPdfText(text);
    const needle=options.caseSensitive?query:query.toLowerCase();
    if(!needle)return found;
    let at=folded.indexOf(needle);
    while(at>=0&&found.length<limit){const start=offsets?.[at]??at,last=offsets?.[at+needle.length-1],end=last===undefined?at+needle.length:last+((text.codePointAt(last)??0)>0xffff?2:1);found.push({charOffset:start,length:end-start});at=folded.indexOf(needle,at+needle.length);}
  } else {
    const regex=new RegExp(searchPattern(query,options.mode),options.caseSensitive?'gu':'giu');
    let match:RegExpExecArray|null;
    while((match=regex.exec(text))&&found.length<limit){
      if(match[0].length)found.push({charOffset:match.index,length:match[0].length});
      else { const cp=text.codePointAt(regex.lastIndex);regex.lastIndex+=cp!==undefined&&cp>0xffff?2:1; }
    }
  }
  return found;
}
