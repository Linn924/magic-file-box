import {textMatches} from './highlight';

export interface SourceSearchIndex {
  count: number;
  lines: Array<{line: number; first: number; count: number}>;
}
const literal=(query:string)=>new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
const yieldSearch=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
/** Count without allocating an object for every occurrence; yield inside even a single very long line. */
export async function indexSourceMatchesAsync(lines:string[],query:string,signal:AbortSignal):Promise<SourceSearchIndex>{
  const result:SourceSearchIndex={count:0,lines:[]};if(!query.trim())return result;
  const pattern=literal(query);let work=0,start=performance.now();
  for(let line=0;line<lines.length;line++){
    let count=0;pattern.lastIndex=0;
    while(pattern.exec(lines[line])){
      count++;
      if(++work%1024===0&&performance.now()-start>4){await yieldSearch();signal.throwIfAborted();start=performance.now();}
    }
    if(count)result.lines.push({line,first:result.count,count});result.count+=count;
    if(line%128===0&&performance.now()-start>4){await yieldSearch();signal.throwIfAborted();start=performance.now();}
  }
  signal.throwIfAborted();return result;
}
export async function sourceMatchAtAsync(index:SourceSearchIndex,lines:string[],query:string,selected:number,signal:AbortSignal){
  if(selected<0||selected>=index.count)return;
  let low=0,high=index.lines.length-1;
  while(low<high){const middle=Math.ceil((low+high)/2);if(index.lines[middle].first<=selected)low=middle;else high=middle-1;}
  const entry=index.lines[low],wanted=selected-entry.first,pattern=literal(query);let match:RegExpExecArray|null=null;
  for(let i=0;i<=wanted;i++){match=pattern.exec(lines[entry.line]);if(!match)return;if(i&&i%2048===0){await yieldSearch();signal.throwIfAborted();}}
  signal.throwIfAborted();return {line:entry.line,start:match!.index,end:match!.index+match![0].length};
}

/** Store counts per matching line; expand offsets only for the selected line. */
export function indexSourceMatches(lines: string[], query: string): SourceSearchIndex {
  const result: SourceSearchIndex = {count: 0, lines: []};
  if (!query.trim()) return result;
  for (let line = 0; line < lines.length; line++) {
    const count = textMatches(lines[line], query).length;
    if (count) result.lines.push({line, first: result.count, count});
    result.count += count;
  }
  return result;
}

export function sourceMatchAt(index: SourceSearchIndex, lines: string[], query: string, selected: number) {
  if (selected < 0 || selected >= index.count) return;
  let low = 0, high = index.lines.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (index.lines[middle].first <= selected) low = middle;
    else high = middle - 1;
  }
  const entry = index.lines[low];
  const range = textMatches(lines[entry.line], query)[selected - entry.first];
  return {...range, line: entry.line};
}
