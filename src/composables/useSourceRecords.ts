import {ref,shallowRef,onMounted,onBeforeUnmount,nextTick,watch} from 'vue';
import type {PreviewFile} from '@shared/files';
import type {SourceInfo,SourcePage,SourceRequest} from '@shared/fileSource';
import {openFileSource,fileSourceError} from '@/services/fileSource';
import {usePreviewTask,previewFrame} from './usePreviewTask';

export function useSourceRecords(file:PreviewFile,emit:(event:'ready'|'error',message?:string)=>void){
  const task=usePreviewTask(),info=shallowRef<SourceInfo>(),page=shallowRef<SourcePage>();
  const busy=ref(false),error=ref(''),query=ref(''),queryNotice=ref(''),start=ref(file.view?.source?.start??0),column=ref(file.view?.source?.column??0),sheet=ref(file.view?.source?.sheet??''),encoding=ref(file.view?.source?.encoding??'');
  const ready=ref(false);
  const elapsed=ref(0);let clock:ReturnType<typeof setInterval>|undefined;
  watch(busy,loading=>{clearInterval(clock);clock=undefined;elapsed.value=0;if(loading){const started=performance.now();clock=setInterval(()=>{elapsed.value=Math.floor((performance.now()-started)/1000);},1000);}},{flush:'sync'});
  let controller:AbortController|undefined,session:Awaited<ReturnType<typeof openFileSource>>|undefined,revision=0,disposed=false,lastQuery='';
  let displayedAssets:typeof session;
  const previousStarts:number[]=[];
  const stop=()=>{revision++;controller?.abort();controller=undefined;void session?.close();session=undefined;busy.value=false;};
  function cancel(){
    stop();
    const saved=file.view?.source;
    if(!saved)return;
    start.value=saved.start;
    column.value=saved.column;
    sheet.value=saved.sheet??'';
    encoding.value=saved.encoding??'';
  }
  const lifetime=()=>{stop();void displayedAssets?.close();displayedAssets=undefined;};
  task.signal.addEventListener('abort',lifetime,{once:true});
  async function load(request:Partial<SourceRequest>={},commit?:()=>void){
    if(busy.value||disposed)return;const current=++revision;busy.value=true;error.value='';queryNotice.value='';
    const release=task.hold?.();
    try{
      task.signal.throwIfAborted();
      // Keep the current segment's image URLs valid while another segment is read.
      if(session&&session===displayedAssets){session=undefined;controller=undefined;}
      if(!session){controller?.abort();controller=new AbortController();const opened=await openFileSource(file,controller.signal,encoding.value||undefined);if(current!==revision||disposed){void opened.close();return;}session=opened;info.value=session.info;encoding.value=info.value.encoding??encoding.value;if(!sheet.value)sheet.value=info.value.sheets?.[0]?.id??'';}
      task.report('parsing');
      const result=await session.page({start:start.value,column:column.value,sheet:sheet.value||undefined,...request});
      if(current!==revision||disposed)return;
      if(request.query&&result.match===undefined){queryNotice.value='后续内容未找到匹配，可回到开头继续查找。';return;}
      commit?.();
      void displayedAssets?.close();
      displayedAssets=result.rows.some(row=>row.assets?.length)?session:undefined;
      start.value=result.start;page.value=result;
      file.view??={zoom:100,scroll:[]};file.view.source={start:start.value,column:column.value,sheet:sheet.value,encoding:encoding.value};
      if(ready.value)return;
      task.report('rendering');await nextTick();await previewFrame(task.signal);
      if(current!==revision||disposed)return;
      if(!ready.value){ready.value=true;emit('ready');}
    }catch(cause){if(current!==revision||disposed||task.signal.aborted)return;error.value=fileSourceError(cause);void session?.close();session=undefined;if(!ready.value)emit('error',error.value);}
    finally{if(current===revision)busy.value=false;release?.();}
  }
  function next(){
    const previous=start.value;
    void load({start:(page.value?.rows.at(-1)?.index??previous)+1},()=>{
      previousStarts.push(previous);
      if(previousStarts.length>256)previousStarts.shift();
    });
  }
  function previous(){void load({start:previousStarts.at(-1)??Math.max(0,start.value-100)},()=>{previousStarts.pop();});}
  function find(){
    const text=query.value;
    if(!text)return;
    const from=lastQuery===text&&page.value?.match!==undefined?page.value.match+1:0;
    void load({start:from,query:text},()=>{lastQuery=text;});
  }
  function resetNavigation(){previousStarts.length=0;lastQuery='';}
  function changeSheet(){column.value=0;void load({start:0},resetNavigation);}
  function changeColumn(delta:number){column.value=Math.max(0,Math.min(16360,column.value+delta));void load();}
  function changeEncoding(){stop();void load({start:0},resetNavigation);}
  onMounted(()=>{void load();});
  onBeforeUnmount(()=>{disposed=true;lifetime();clearInterval(clock);task.signal.removeEventListener('abort',lifetime);});
  return {info,page,busy,ready,elapsed,error,query,queryNotice,start,column,sheet,encoding,load,cancel,next,previous,find,changeSheet,changeColumn,changeEncoding};
}
