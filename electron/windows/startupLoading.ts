import {app,screen,systemPreferences,type BrowserWindow,type WebContents} from 'electron';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {windowTheme} from '@shared/windowTheme';

type Bounds={x:number;y:number;width:number;height:number};
type Layer={host:Host;contents:WebContents;cardId:number;bounds:Bounds;painted:boolean;revision:number;physical?:Bounds;animated:boolean;refresh:()=>void;detach:()=>void};
type Host={child:ChildProcessWithoutNullStreams;ids:Set<number>;animated:Set<number>;retiring:boolean;
  closes:Map<number,{resolve:()=>void;timer:ReturnType<typeof setTimeout>}>;
  captures:Map<number,{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>};
const layers=new Map<number,Layer>();
const cards=new Map<number,Layer>();
let nextCardId=0;
const hosts=new Set<Host>();
let currentHost:Host|undefined;

function send(host:Host,line:string){
  if(!host.child.stdin.destroyed)host.child.stdin.write(line+'\n');
}
function retire(host:Host){
  if(host.ids.size||host.retiring)return;
  host.retiring=true;
  if(currentHost===host)currentHost=undefined;
  send(host,'QUIT');
}
function hostForStartup(){
  if(currentHost&&!currentHost.retiring)return currentHost;
  const executable=app.isPackaged?path.join(process.resourcesPath,'native-loading.exe'):path.join(__dirname,'native-loading.exe');
  const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const host:Host={child,ids:new Set(),animated:new Set(),retiring:false,closes:new Map(),captures:new Map()};
  hosts.add(host);currentHost=host;
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    const fields=line.replace(/^\uFEFF/,'').split('\t'),id=Number(fields[1]);
    const layer=cards.get(id);
    if(fields[0]==='PAINTED'&&layer?.host===host&&Number(fields[6])===layer.revision){
      layer.painted=true;
      layer.physical={x:Number(fields[2]),y:Number(fields[3]),width:Number(fields[4]),height:Number(fields[5])};
      if(layer.animated)host.animated.add(id);else host.animated.delete(id);
    }else if(fields[0]==='UPDATED'&&layer?.host===host&&!layer.animated){
      host.animated.delete(id);
    }else if(fields[0]==='CLOSED'){
      if(layer?.host===host){
        layer.detach();
        if(!layer.contents.isDestroyed())layer.contents.send('startup:unavailable');
      }
      host.ids.delete(id);host.animated.delete(id);
      const pending=host.closes.get(id);
      if(pending){clearTimeout(pending.timer);host.closes.delete(id);pending.resolve();}
      retire(host);
    }else if(fields[0]==='CAPTURED'){
      const capture=host.captures.get(id);
      if(capture){clearTimeout(capture.timer);host.captures.delete(id);capture.resolve();}
    }else if(fields[0]==='ERROR'){
      const capture=host.captures.get(id);
      if(capture){clearTimeout(capture.timer);host.captures.delete(id);capture.reject(Error('Native loading capture failed.'));}
      else host.child.kill();
    }
  });
  child.stderr.on('data',data=>console.error('Native loading helper:',data.toString().trim()));
  let ended=false;
  function endedHost(){
    if(ended)return;ended=true;
    lines.close();hosts.delete(host);
    if(currentHost===host)currentHost=undefined;
    for(const id of host.ids){
      const layer=cards.get(id);
      if(layer?.host===host){
        layer.detach();
        if(!layer.contents.isDestroyed())layer.contents.send('startup:unavailable');
      }
    }
    host.ids.clear();host.animated.clear();
    for(const pending of host.closes.values()){clearTimeout(pending.timer);pending.resolve();}
    host.closes.clear();
    for(const pending of host.captures.values()){clearTimeout(pending.timer);pending.reject(Error('Native loading process exited.'));}
    host.captures.clear();
  }
  child.once('error',endedHost);child.once('exit',endedHost);
  child.stdin.on('error',()=>{child.kill();});
  return host;
}

export function startupLoadingStats(id?:number){
  const layer=id===undefined?undefined:layers.get(id);
  return {layers:layers.size,timers:[...hosts].reduce((sum,host)=>sum+host.animated.size,0),
    processes:hosts.size,bounds:layer?.bounds,painted:layer?.painted??false,
    physicalBounds:layer?.physical,helperPid:layer?.host.child.pid};
}
export function hasStartupLoading(id:number){return layers.has(id);}
export function nativeStartupToken(id:number){return layers.get(id)?.cardId;}
export async function captureStartupLoading(id:number,filename:string){
  const layer=layers.get(id);
  if(!layer?.painted)throw Error('Native loading has not painted.');
  const host=layer.host;
  const cardId=layer.cardId;
  if(host.captures.has(cardId))throw Error('Capture is already pending.');
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{
      host.captures.delete(cardId);reject(Error('Native loading capture timed out.'));
    },3000);
    host.captures.set(cardId,{resolve,reject,timer});
    send(host,'CAPTURE\t'+cardId+'\t'+Buffer.from(filename,'utf8').toString('base64'));
  });
}
function closeLayer(id:number){
  const layer=layers.get(id);
  if(!layer)return Promise.resolve();
  const host=layer.host;
  const cardId=layer.cardId;
  layer.detach();
  return new Promise<void>(resolve=>{
    const timer=setTimeout(()=>{host.closes.delete(cardId);host.child.kill();resolve();},1500);
    host.closes.set(cardId,{resolve,timer});
    send(host,'CLOSE\t'+cardId);
  });
}
export function finishNativeStartup(win:BrowserWindow,token:number){
  if(nativeStartupToken(win.webContents.id)!==token)return Promise.resolve();
  return closeLayer(win.webContents.id);
}
export function restartNativeStartup(win:BrowserWindow,theme:()=>ReturnType<typeof windowTheme>){
  void closeLayer(win.webContents.id);
  attachNativeStartup(win,theme);
}
export function refreshNativeStartups(){for(const layer of layers.values())layer.refresh();}
export function stopNativeStartups(){for(const host of hosts)host.child.kill();}

export function attachNativeStartup(win:BrowserWindow,theme:()=>ReturnType<typeof windowTheme>){
  const contents=win.webContents,id=contents.id;
  const host=hostForStartup();
  const cardId=++nextCardId;
  let detached=false,key='';
  let resizeTask:ReturnType<typeof setTimeout>|undefined;
  const layer:Layer={host,contents,cardId,bounds:{x:0,y:0,width:220,height:176},painted:false,revision:0,animated:true,refresh,detach};
  function refresh(){
    if(detached||win.isDestroyed())return;
    const content=win.getContentBounds();
    const scale=screen.getDisplayMatching(win.getBounds()).scaleFactor;
    const physical=screen.dipToScreenRect(win,content);
    layer.bounds={x:Math.round((content.width-220)/2),y:Math.round((content.height-176)/2),width:220,height:176};
    const visible=win.isVisible()&&!win.isMinimized();
    layer.animated=visible&&systemPreferences.getAnimationSettings().shouldRenderRichAnimation;
    const fields=['UPDATE',cardId,win.getNativeWindowHandle().readBigUInt64LE().toString(),
      physical.x,physical.y,physical.width,physical.height,scale,theme().name,layer.animated?1:0,visible?1:0];
    const command=fields.join('\t');
    if(key===command)return;
    key=command;layer.painted=false;layer.revision++;
    send(host,command+'\t'+layer.revision);
  }
  function scheduleRefresh(){
    clearTimeout(resizeTask);
    resizeTask=setTimeout(()=>{resizeTask=undefined;refresh();},0);
  }
  function closed(){void closeLayer(id);}
  function detach(){
    if(detached)return;detached=true;
    clearTimeout(resizeTask);layers.delete(id);cards.delete(cardId);
    win.removeListener('resize',scheduleRefresh);win.removeListener('move',scheduleRefresh);
    win.removeListener('show',scheduleRefresh);win.removeListener('hide',scheduleRefresh);
    win.removeListener('minimize',scheduleRefresh);win.removeListener('restore',scheduleRefresh);
    win.removeListener('closed',closed);
    contents.removeListener('render-process-gone',closed);
  }
  layers.set(id,layer);cards.set(cardId,layer);host.ids.add(cardId);
  win.on('resize',scheduleRefresh);win.on('move',scheduleRefresh);
  win.on('show',scheduleRefresh);win.on('hide',scheduleRefresh);
  win.on('minimize',scheduleRefresh);win.on('restore',scheduleRefresh);
  win.once('closed',closed);contents.on('render-process-gone',closed);
  refresh();
}
