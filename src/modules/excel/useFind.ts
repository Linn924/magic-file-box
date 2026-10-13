import {ref,watch,onBeforeUnmount,type Ref} from 'vue';
import * as XLSX from 'xlsx';
import type {useEditor} from './useEditor';
import {createFindMatcher,orderedAddresses,replacementText,type FindOptions,type FindHit} from './findModel';
export function useFind(editor:ReturnType<typeof useEditor>,book:Ref<XLSX.WorkBook|undefined>,sheet:Ref<string>,range:()=>XLSX.Range,prepare:()=>boolean,locate:(address:string)=>Promise<boolean>,displayText:(address:string)=>string,visible:(address:string)=>boolean){
  const open=ref(false),query=ref(''),replacement=ref(''),scope=ref<'sheet'|'selection'>('sheet'),source=ref<FindOptions['source']>('display'),caseSensitive=ref(false),whole=ref(false),hits=ref<FindHit[]>([]),index=ref(-1),busy=ref(false),message=ref(''),limited=ref(false);
  const fixedRange=ref<XLSX.Range>();let generation=0,timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
  const options=():FindOptions=>({query:query.value,source:source.value,caseSensitive:caseSensitive.value,whole:whole.value});
  function schedule(){generation++;clearTimeout(timer);hits.value=[];index.value=-1;message.value='';limited.value=false;busy.value=false;if(open.value&&query.value){busy.value=true;timer=setTimeout(()=>void search(generation),120);}}
  async function search(id:number){
    try{const ws=book.value?.Sheets[sheet.value];if(!ws)return;const config=options(),matches=createFindMatcher(config),found:FindHit[]=[];editor.calculator.value?.beginBatch();
      const addresses=orderedAddresses([...Object.keys(ws),...editor.changes.value.filter(c=>c.sheet===sheet.value).map(c=>c.address)],scope.value==='selection'?fixedRange.value:undefined);
      for(let i=0;i<addresses.length;i++){
        if(id!==generation||disposed)return;
        const address=addresses[i],value=editor.valueAt(sheet.value,address);let text='';
        if(value.kind!=='blank'){
          if(config.source==='expression')text=value.kind==='formula'?'='+value.value:String(value.value);
          else text=displayText(address);
        }
        if(matches(text)){found.push({address,text,value});if(found.length>20000){found.pop();limited.value=true;break;}}
        if(i%300===299){await new Promise<void>(resolve=>setTimeout(resolve,0));editor.calculator.value?.beginBatch();}
      }
      if(id!==generation||disposed)return;hits.value=found;index.value=found.length?0:-1;message.value=limited.value?'命中过多，仅展示前 20000 格；请缩小范围后替换。':'';
    }catch(e){if(id===generation)message.value=(e as Error).message;}finally{if(id===generation)busy.value=false;}
  }
  function capture(){fixedRange.value=JSON.parse(JSON.stringify(range()));schedule();}
  function show(){if(!prepare())return;capture();open.value=true;schedule();}
  async function navigate(direction:number){if(busy.value||!hits.value.length||!prepare())return;index.value=(index.value+direction+hits.value.length)%hits.value.length;const address=hits.value[index.value].address;if(!visible(address)){message.value=address+' 位于隐藏行或列，取消隐藏后可查看；不会自动改变布局。';return;}message.value='';await locate(address);}
  async function replace(all=false){
    if(!editor.editing.value||editor.saving.value||busy.value||limited.value||!prepare())return;
    const targets=all?hits.value:[hits.value[index.value<0?0:index.value]].filter(Boolean);if(!targets.length)return;
    try{const config=options();let size=0;const updates=targets.map(hit=>{const text=replacementText(hit,config,replacement.value);size+=text.length;if(text.length>32767||size>10000000)throw Error('替换内容超过单格 32767 字符或整批 1000 万字符上限，请缩小范围。');return {address:hit.address,text,literal:hit.value.kind==='text',expected:hit.value};});
      if(editor.replaceCells(sheet.value,updates)){message.value=`已替换 ${updates.length} 格，可撤销`;schedule();}
      else message.value=editor.error.value;
    }catch(e){message.value=(e as Error).message;}
  }
  watch([query,source,caseSensitive,whole,scope,open,sheet,editor.changes,editor.baseBytes],()=>{if(scope.value==='selection'&&!fixedRange.value)capture();schedule();});
  watch(sheet,()=>{if(scope.value==='selection'){scope.value='sheet';fixedRange.value=undefined;}});
  watch(editor.editing,value=>{if(!value)scope.value='sheet';});
  onBeforeUnmount(()=>{disposed=true;generation++;clearTimeout(timer);});
  function marked(address:string){return open.value&&hits.value[index.value]?.address===address;}
  return {open,query,replacement,scope,source,caseSensitive,whole,hits,index,busy,message,limited,fixedRange,capture,show,navigate,replace,marked};
}
