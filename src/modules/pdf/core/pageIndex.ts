/** Fenwick tree: page-size corrections and prefix positions in O(log n). */
export class PageIndex {
  private values: number[];
  private tree: number[];
  constructor(values: number[]) {
    this.values = [...values];
    this.tree = new Array(values.length + 1).fill(0);
    for (let i=1;i<this.tree.length;i++) {
      this.tree[i] += values[i-1];
      const parent=i+(i&-i);
      if(parent<this.tree.length)this.tree[parent]+=this.tree[i];
    }
  }
  set(index: number, value: number) {
    const delta=value-this.values[index];this.values[index]=value;
    for(let i=index+1;i<this.tree.length;i+=i&-i)this.tree[i]+=delta;
  }
  prefix(count: number) {
    let sum=0;for(let i=Math.min(count,this.values.length);i>0;i-=i&-i)sum+=this.tree[i];
    return sum;
  }
  indexAt(offset: number) {
    let index=0,sum=0,bit=1;
    while(bit*2<this.tree.length)bit*=2;
    for(;bit;bit>>=1){const next=index+bit;if(next<this.tree.length&&sum+this.tree[next]<=offset){sum+=this.tree[next];index=next;}}
    return Math.min(index,Math.max(0,this.values.length-1));
  }
}
