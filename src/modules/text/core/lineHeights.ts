/** Prefix heights for wrapped virtual lines; unmeasured lines use one-line estimates. */
export class LineHeights {
  private heights:number[];
  private tree:number[];
  private measured=new Map<number,number>();
  constructor(public count:number,private estimate:number){
    this.heights=Array(count).fill(estimate);this.tree=Array(count+1).fill(0);
    for(let i=1;i<=count;i++){this.tree[i]+=estimate;const parent=i+(i&-i);if(parent<=count)this.tree[parent]+=this.tree[i];}
  }
  prefix(count:number){let sum=0;for(let i=Math.min(count,this.count);i>0;i-=i&-i)sum+=this.tree[i];return sum;}
  at(y:number){let page=0,sum=0,bit=1;while(bit*2<=this.count)bit*=2;for(;bit;bit>>=1){const next=page+bit;if(next<=this.count&&sum+this.tree[next]<=y){sum+=this.tree[next];page=next;}}return Math.min(page,Math.max(0,this.count-1));}
  set(index:number,height:number){
    if(index<0||index>=this.count||!Number.isFinite(height)||height<=0)return false;
    const difference=height-this.heights[index];if(Math.abs(difference)<.05)return false;
    this.heights[index]=height;this.measured.set(index,height);for(let i=index+1;i<=this.count;i+=i&-i)this.tree[i]+=difference;return true;
  }
  scaled(ratio:number,estimate:number){const next=new LineHeights(this.count,estimate);for(const [index,height] of this.measured)next.set(index,height*ratio);return next;}
}
