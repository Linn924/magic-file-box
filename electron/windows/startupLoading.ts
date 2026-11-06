import {ImageView,nativeImage,screen,systemPreferences,type BrowserWindow,type NativeImage} from 'electron';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {windowTheme} from '@shared/windowTheme';

type Manifest={width:number;height:number;scales:number[];count:number;period:number};
type Layer={dispose:()=>void;refresh:()=>void;card:ImageView};
const layers=new Map<number,Layer>();
const cache=new Map<string,{first:NativeImage;frames:Promise<NativeImage[]>}>();
let manifest:Manifest|undefined;
let activeTimers=0;
const assets=path.resolve(__dirname,'../dist/native-loading');

export function startupLoadingStats(id?:number){
  const layer=id===undefined?undefined:layers.get(id);
  return {layers:layers.size,timers:activeTimers,bounds:layer?.card.getBounds()};
}
export function hasStartupLoading(id:number){return layers.has(id);}
export function finishNativeStartup(win:BrowserWindow){
  layers.get(win.webContents.id)?.dispose();
}
export function refreshNativeStartups(){for(const layer of layers.values())layer.refresh();}
export function attachNativeStartup(win:BrowserWindow,theme:()=>ReturnType<typeof windowTheme>){
  manifest??=JSON.parse(readFileSync(path.join(assets,'manifest.json'),'utf8')) as Manifest;
  const spec=manifest;
  const card=new ImageView();
  const contents=win.webContents;
  const id=contents.id;
  const throttling=contents.getBackgroundThrottling();
  let disposed=false,serial=0,frames:NativeImage[]=[],key='';
  let resizeTask:ReturnType<typeof setTimeout>|undefined;
  const started=performance.now();
  function layout(){
    if(disposed||win.isDestroyed())return;
    const [width,height]=win.getContentSize();
    card.setBounds({x:Math.round((width-spec.width)/2),y:Math.round((height-spec.height)/2),
      width:spec.width,height:spec.height});
  }
  function refresh(){
    if(disposed||win.isDestroyed())return;
    layout();
    const dpi=screen.getDisplayMatching(win.getBounds()).scaleFactor;
    const scale=spec.scales.find(value=>value>=dpi)??spec.scales.at(-1)!;
    const dir=path.join(assets,theme().name,String(scale));
    if(key===dir)return;
    key=dir;
    const generation=++serial;
    let entry=cache.get(dir);
    if(!entry){
      const decode=(bytes:Buffer)=>nativeImage.createFromBuffer(bytes,{scaleFactor:scale});
      const first=decode(readFileSync(path.join(dir,'0.png')));
      entry={first,frames:Promise.all(Array.from({length:spec.count},async(_,index)=>
        index===0?first:decode(await readFile(path.join(dir,index+'.png')))))};
      cache.set(dir,entry);
      if(cache.size>2)cache.delete(cache.keys().next().value!);
    }
    frames=[entry.first];
    card.setImage(entry.first);
    void entry.frames.then(value=>{
      if(!disposed&&serial===generation)frames=value;
    }).catch(()=>{cache.delete(dir);});
  }
  function dispose(){
    if(disposed)return;
    disposed=true;serial++;
    if(timer){clearInterval(timer);activeTimers--;}
    clearTimeout(resizeTask);
    layers.delete(id);
    if(layers.size===0)cache.clear();
    win.removeListener('resize',scheduleRefresh);win.removeListener('move',scheduleRefresh);
    contents.removeListener('did-start-navigation',navigate);
    contents.removeListener('render-process-gone',dispose);
    if(!win.isDestroyed()){
      win.contentView.removeChildView(card);
      if(!contents.isDestroyed())contents.setBackgroundThrottling(throttling);
    }
    frames=[];
  }
  function navigate(event:Electron.Event&{isMainFrame:boolean}){
    if(!event.isMainFrame||disposed)return;
    // A reload gets a fresh readiness signal while keeping the same native layer.
    card.setVisible(true);
  }
  function scheduleRefresh(){
    clearTimeout(resizeTask);
    resizeTask=setTimeout(()=>{resizeTask=undefined;refresh();},0);
  }
  refresh();
  win.contentView.addChildView(card);
  win.webContents.setBackgroundThrottling(false);
  const timer=systemPreferences.getAnimationSettings().shouldRenderRichAnimation?setInterval(()=>{
    if(disposed||win.isDestroyed()||!win.isVisible())return;
    const frame=Math.floor((performance.now()-started)%spec.period/spec.period*spec.count);
    card.setImage(frames[frame%frames.length]);
  },1000/60):undefined;
  if(timer)activeTimers++;
  layers.set(id,{dispose,refresh,card});
  win.on('resize',scheduleRefresh);win.on('move',scheduleRefresh);
  win.once('closed',dispose);
  win.webContents.on('render-process-gone',dispose);
  win.webContents.on('did-start-navigation',navigate);
}
