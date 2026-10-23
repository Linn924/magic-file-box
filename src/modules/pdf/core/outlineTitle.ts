import type {PDFPageProxy} from 'pdfjs-dist';
import type {PdfDestination,PdfReadingPosition} from './destination';

type TextContent=Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
type Line={text:string;left:number;top:number;height:number;baseline:number;right:number};
const normalized=(value:string)=>value.normalize('NFKC').replace(/\s+/gu,'').toLowerCase();

/** Correct imprecise bookmarks only when the full heading uniquely matches up to three adjacent text lines. */
export function outlineTitleDestinations(targets:PdfDestination[],content:TextContent,viewport:PdfReadingPosition['viewport']):PdfDestination[]{
  const fallback=()=>targets.map(target=>({...target,titleResolved:true}));
  if(content.items.length>20000||content.items.reduce((size,item)=>size+('str' in item?item.str.length:0),0)>200000)return fallback();
  const queries=new Set(targets.map(target=>normalized(target.title??'')).filter(title=>title.length>=2&&title.length<=512));
  if(!queries.size)return fallback();
  const lines:Line[]=[];let line:Line|undefined;
  const finish=()=>{if(line?.text)lines.push(line);line=undefined;};
  for(const item of content.items){
    if(!('str' in item))continue;
    if(!item.str.trim()){if(item.hasEOL)finish();continue;}
    const [a,b,c,d,x,y]=item.transform,font=content.styles[item.fontName],height=Math.hypot(c,d);
    // Leave vertical/rotated source text to the original bookmark; page rotation is handled by the viewport later.
    if(font?.vertical||a<=0||Math.abs(b)>.01||Math.abs(c)>.01||d<=0||!height){finish();continue;}
    const ascent=font?.ascent??(font?.descent!==undefined?1+font.descent:.8);
    const [left,top]=viewport.convertToViewportPoint(x,y+height*ascent),[,baseline]=viewport.convertToViewportPoint(x,y);
    const text=normalized(item.str);
    if(line&&(Math.abs(baseline-line.baseline)>Math.max(height,line.height)*.35||left<line.right-height||left-line.right>height*4))finish();
    if(!line)line={text:'',left,top,height,baseline,right:left};
    line.text+=text;line.top=Math.min(line.top,top);line.height=Math.max(line.height,height);line.right=left+item.width;
    if(item.hasEOL)finish();
  }
  finish();
  const matches=new Map<string,{line:Line;count:number}>();
  for(let i=0;i<lines.length;i++){
    let text='';
    for(let n=i;n<Math.min(lines.length,i+3);n++){
      const current=lines[n],previous=lines[n-1];
      if(n>i&&(current.top<=previous.top||current.top-previous.top>Math.max(current.height,previous.height)*3||Math.abs(current.left-lines[i].left)>lines[i].height*4||current.height/lines[i].height<.7||current.height/lines[i].height>1.4))break;
      text+=current.text;if(text.length>512)break;
      if(queries.has(text)){const match=matches.get(text);if(match)match.count++;else matches.set(text,{line:lines[i],count:1});}
    }
  }
  return targets.map(target=>{
    const match=matches.get(normalized(target.title??''));
    if(!match||match.count!==1)return {...target,titleResolved:true};
    const [x,y]=viewport.convertToPdfPoint(match.line.left,match.line.top);
    return {...target,dest:[target.dest[0],{name:'XYZ'},x,y,null],titleResolved:true};
  });
}
