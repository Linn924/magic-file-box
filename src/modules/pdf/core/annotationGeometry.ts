import type {PdfTemporaryMark} from '@shared/contracts';
type Rect=PdfTemporaryMark['rects'][number];
export function rotateNoteRect(rect:Rect,from:number,to:number):Rect {
  const delta=(to-from+360)%360;
  return delta===90?{x:1-rect.y-rect.height,y:rect.x,width:rect.height,height:rect.width}
    :delta===180?{x:1-rect.x-rect.width,y:1-rect.y-rect.height,width:rect.width,height:rect.height}
    :delta===270?{x:rect.y,y:1-rect.x-rect.width,width:rect.height,height:rect.width}:rect;
}
/** Merge only near neighbours with at least 80% cross-axis overlap; retain columns. */
export function mergeNoteRects(rects:Rect[],gapX:number,gapY:number):Rect[] {
  const out:Rect[]=[];
  for(const rect of rects){
    let box={...rect},changed=true;
    while(changed){changed=false;
      for(let i=0;i<out.length;i++){
        const other=out[i];
        const overlapX=Math.max(0,Math.min(box.x+box.width,other.x+other.width)-Math.max(box.x,other.x));
        const overlapY=Math.max(0,Math.min(box.y+box.height,other.y+other.height)-Math.max(box.y,other.y));
        const dx=Math.max(box.x,other.x)-Math.min(box.x+box.width,other.x+other.width);
        const dy=Math.max(box.y,other.y)-Math.min(box.y+box.height,other.y+other.height);
        if((overlapY>=Math.min(box.height,other.height)*0.8&&dx<=gapX)||(overlapX>=Math.min(box.width,other.width)*0.8&&dy<=gapY)){
          const x=Math.min(box.x,other.x),y=Math.min(box.y,other.y);
          box={x,y,width:Math.max(box.x+box.width,other.x+other.width)-x,height:Math.max(box.y+box.height,other.y+other.height)-y};out.splice(i,1);changed=true;break;
        }
      }
    }
    out.push(box);
  }
  return out;
}
