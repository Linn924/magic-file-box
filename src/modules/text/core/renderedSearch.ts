import {textMatches} from './highlight';
/** Search across inline markup without rewriting author HTML or code. */
export function highlightRendered(root:HTMLElement,query:string){
  for(const mark of root.querySelectorAll('mark.md-render-hit'))mark.replaceWith(document.createTextNode(mark.textContent||''));root.normalize();
  const groups=new Map<Element,{text:string;nodes:Array<{node:Text;start:number}>}>();
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode() as Text|null;node;node=walker.nextNode() as Text|null){
    const parent=node.parentElement;if(!parent||parent.closest('button,.md-image-error,.md-diagram,.md-diagram-source:not(.md-source-visible),.katex,.md-task,script,style'))continue;
    const block=parent.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote')||root;
    const group=groups.get(block)||{text:'',nodes:[]};group.nodes.push({node,start:group.text.length});group.text+=node.data;groups.set(block,group);
  }
  const hits:HTMLElement[]=[];
  for(const group of groups.values()){
    const matches=textMatches(group.text,query);const parts=new Map<Text,Array<{start:number;end:number;hit:number}>>(),first=new Map<number,HTMLElement>();
    for(const [hit,match] of matches.entries())for(const item of group.nodes){const start=Math.max(0,match.start-item.start),end=Math.min(item.node.length,match.end-item.start);if(start<end){const list=parts.get(item.node)||[];list.push({start,end,hit});parts.set(item.node,list);}}
    for(const [node,ranges] of parts){const fragment=document.createDocumentFragment();let offset=0;for(const range of ranges){fragment.append(node.data.slice(offset,range.start));const mark=document.createElement('mark');mark.className='md-render-hit';mark.textContent=node.data.slice(range.start,range.end);fragment.append(mark);if(!first.has(range.hit))first.set(range.hit,mark);offset=range.end;}fragment.append(node.data.slice(offset));node.replaceWith(fragment);}
    for(const [hit] of matches.entries())if(first.has(hit))hits.push(first.get(hit)!);
  }
  return hits;
}
