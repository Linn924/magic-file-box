import type {PreviewFile} from '@shared/files';

export interface ResidentPreview {
  active:()=>boolean;
  loading:()=>boolean;
  cost:()=>number;
  evict:()=>Promise<boolean>;
}
/** Estimated preview allocations, not a hard limit on renderer/process memory. */
export class PreviewResidency {
  private entries=new Map<ResidentPreview,number>();
  private order=0;
  private running:Promise<void>|undefined;
  private again=false;
  constructor(private budget=256*1024*1024,private pressure=()=>false){}
  add(entry:ResidentPreview){this.entries.set(entry,++this.order);}
  touch(entry:ResidentPreview){if(this.entries.has(entry))this.entries.set(entry,++this.order);}
  remove(entry:ResidentPreview){this.entries.delete(entry);}
  get size(){return this.entries.size;}
  trim():Promise<void>{
    this.again=true;
    return this.running??=Promise.resolve().then(async()=>{
      try{
        while(this.again){
          this.again=false;
          const pressured=this.pressure();
          const costs=new Map([...this.entries.keys()].map(item=>[item,Math.max(0,item.cost())]));
          let total=[...costs.values()].reduce((sum,cost)=>sum+cost,0);
          for(const [entry] of [...this.entries].sort((a,b)=>a[1]-b[1])){
            if(!pressured&&total<=this.budget)break;
            if(!this.entries.has(entry)||entry.active()||entry.loading()||!costs.get(entry))continue;
            if(await entry.evict())total-=costs.get(entry)!;
          }
        }
      }finally{this.running=undefined;}
    });
  }
}

function heapPressure(){
  const heap=(performance as Performance&{memory?:{usedJSHeapSize:number;jsHeapSizeLimit:number}}).memory;
  return !!heap&&heap.jsHeapSizeLimit>0&&heap.usedJSHeapSize>Math.max(64*1024*1024,heap.jsHeapSizeLimit*.85);
}
// Each renderer owns its own manager; no window can evict another window's preview.
const residency=new PreviewResidency(256*1024*1024,heapPressure);
let clock:ReturnType<typeof setInterval>|undefined;
const check=()=>{void residency.trim();};
export function retainPreview(entry:ResidentPreview){
  residency.add(entry);
  if(!clock){clock=setInterval(check,5000);window.addEventListener('focus',check);}
  return {
    changed(){if(entry.active())residency.touch(entry);check();},
    release(){residency.remove(entry);if(!residency.size){clearInterval(clock);clock=undefined;window.removeEventListener('focus',check);}},
  };
}

export function previewCost(file:PreviewFile,root:HTMLElement|undefined){
  // Decoded models can be larger than source bytes; large file-backed sources only
  // account for their mounted segment, never the full on-disk file size.
  let cost=2*1024*1024+(file.bytes?.byteLength??0)*(['xlsx','xls','docx','doc','pptx','ppt'].includes(file.ext)?8:3);
  let remaining=20000;
  const visit=(root:Element|ShadowRoot)=>{
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
    for(let node=walker.nextNode() as Element|null;node&&remaining>0;node=walker.nextNode() as Element|null){
      remaining--;cost+=512;
      if(node instanceof HTMLCanvasElement)cost+=node.width*node.height*4;
      if(node instanceof HTMLImageElement)cost+=node.naturalWidth*node.naturalHeight*4;
      if(node.shadowRoot)visit(node.shadowRoot);
    }
  };
  if(root)visit(root);
  return cost;
}
