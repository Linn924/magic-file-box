import {PageIndex} from './pageIndex';
export interface PageBox {width:number;height:number}
export interface PdfRow {pages:number[];width:number;height:number}
export const PDF_ROW_GAP=24;
export const PDF_PAIR_GAP=24;
export const PDF_PAIR_MARGIN=16;
/** Stable physical pairs (1–2, 3–4); each pair independently fits or splits. */
export class PdfRowIndex {
  rows:PdfRow[]=[];
  private boxes:PageBox[]=[];
  private paired:boolean[]=[];
  private pageRows:number[]=[];
  private index=new PageIndex([]);
  private available=0;
  private allowPairs=true;
  rebuild(boxes:PageBox[],available:number,allowPairs=true) {
    this.boxes=boxes.map(box=>({...box}));this.available=Math.max(1,available);this.allowPairs=allowPairs;
    this.paired=Array.from({length:Math.ceil(boxes.length/2)},(_,pair)=>this.shouldPair(pair,this.paired[pair]??false));
    this.reindex();
  }
  private shouldPair(pair:number,previous:boolean) {
    const a=this.boxes[pair*2],b=this.boxes[pair*2+1];
    return !!a&&!!b&&this.allowPairs&&a.width+b.width+PDF_PAIR_GAP<=this.available-(previous?0:PDF_PAIR_MARGIN);
  }
  private makeRow(pages:number[]):PdfRow {
    return {pages,width:pages.reduce((sum,page)=>sum+this.boxes[page].width,0)+(pages.length-1)*PDF_PAIR_GAP,height:Math.max(...pages.map(page=>this.boxes[page].height))};
  }
  private reindex(){
    this.rows=[];this.pageRows=[];
    for(let first=0;first<this.boxes.length;first+=2){
      const pairs=this.paired[first/2]?[ [first,first+1] ]:first+1<this.boxes.length?[[first],[first+1]]:[[first]];
      for(const pages of pairs){for(const page of pages)this.pageRows[page]=this.rows.length;this.rows.push(this.makeRow(pages));}
    }
    this.index=new PageIndex(this.rows.map(row=>row.height+PDF_ROW_GAP));
  }
  /** Only changed pairs are measured; rebuild the tree when membership changes. */
  update(updates:Array<PageBox&{index:number}>) {
    const pairs=new Set<number>();
    for(const {index,width,height} of updates){this.boxes[index]={width,height};pairs.add(Math.floor(index/2));}
    let topologyChanged=false;
    for(const pair of pairs){const value=this.shouldPair(pair,this.paired[pair]);if(value!==this.paired[pair]){this.paired[pair]=value;topologyChanged=true;}}
    if(topologyChanged){this.reindex();return true;}
    const rows=new Set<number>();
    for(const pair of pairs)for(const page of [pair*2,pair*2+1])if(page<this.boxes.length)rows.add(this.rowForPage(page));
    for(const row of rows){this.rows[row]=this.makeRow(this.rows[row].pages);this.index.set(row,this.rows[row].height+PDF_ROW_GAP);}
    return false;
  }
  rowForPage(page:number){return this.pageRows[Math.max(0,Math.min(this.boxes.length-1,page))]??0;}
  offsetForPage(page:number){return this.offset(this.rowForPage(page));}
  offset(row:number){return this.index.prefix(row);}
  rowAt(y:number){return this.index.indexAt(y);}
  get mode():'single'|'double'|'mixed' {
    const doubles=this.rows.filter(row=>row.pages.length===2).length;
    // An unpaired final page does not turn a regular double-page layout into mixed.
    const singles=this.rows.filter(row=>row.pages.length===1&&row.pages[0]!==this.boxes.length-1).length;
    return doubles?(singles?'mixed':'double'):'single';
  }
}
