import {app,BrowserWindow,dialog,ipcMain} from 'electron';
import {version} from '../../package.json';
import {trusted} from '../security';
import {hasModified} from '../modifiedFiles';
import {UpdateController} from './controller';
import {createUpdateDriver} from './driver';
import {RestartCoordinator} from './restart';
import type {UpdateAction,UpdateState} from '../../shared/updates';
import {existsSync} from 'node:fs';
import path from 'node:path';
export function setupUpdates(autoCheck:()=>boolean,busy:()=>boolean){
  let phase:UpdateState['phase']='idle',restart:RestartCoordinator|undefined,installing:Promise<UpdateState>|undefined,checked=false,noticePending=false;
  const readyWindows=new Set<number>();
  const appWindows=()=>BrowserWindow.getAllWindows().filter(win=>{if(win.isDestroyed())return false;try{const u=new URL(win.webContents.getURL());return u.protocol==='preview:'&&u.hostname==='local'&&u.pathname==='/index.html'&&!u.searchParams.has('print')&&!u.searchParams.has('print-panel');}catch{return false;}});
  const installed=app.isPackaged&&process.platform==='win32'&&existsSync(path.join(path.dirname(app.getPath('exe')),'Uninstall File Preview.exe'));
  const controller=new UpdateController(version,installed?createUpdateDriver():undefined,state=>{
    for(const win of appWindows())win.webContents.send('updates:changed',state);
    if(!['available','downloaded'].includes(state.phase))noticePending=false;
    else if(state.phase!==phase){noticePending=true;notify();}
    if(phase==='installing'&&state.phase!=='installing')restart?.resume();phase=state.phase;
  });
  function notify(){if(!noticePending)return;const wins=appWindows().filter(w=>w.isVisible()&&readyWindows.has(w.webContents.id)),target=wins.find(w=>w.isFocused())||wins.at(-1);if(target){noticePending=false;target.webContents.send('updates:notice');}}
  const created=(_event:Electron.Event,win:BrowserWindow)=>{const id=win.webContents.id;win.on('show',notify);win.once('closed',()=>readyWindows.delete(id));};
  app.on('browser-window-created',created);
  restart=new RestartCoordinator(()=>appWindows().map(win=>({id:win.webContents.id,send:(channel:string,token:string)=>win.webContents.send(channel,token)})),busy,()=>hasModified(),async notes=>{
    const wins=appWindows(),parent=wins.find(w=>w.isFocused())||wins.find(w=>w.isVisible());if(!parent)return false;
    const result=await dialog.showMessageBox(parent,{type:'question',title:'重启并更新文件预览',message:'现在关闭所有窗口并安装新版本？',detail:notes?'PDF 临时批注会清空，不能在重启后恢复。请确认已导出需要保留的批注。':'当前预览会关闭，密码和内存会话将清空。源文件及已另存副本不会改变。',buttons:['重启并更新','取消'],defaultId:1,cancelId:1,noLink:true});return result.response===0;
  });
  const allowed=(event:Electron.IpcMainInvokeEvent)=>{trusted(event);if(!appWindows().some(w=>w.webContents.id===event.sender.id))throw Error('无效更新窗口。');};
  ipcMain.handle('updates:get',event=>{allowed(event);readyWindows.add(event.sender.id);queueMicrotask(notify);return controller.snapshot();});
  ipcMain.handle('updates:action',async(event,action:UpdateAction)=>{allowed(event);if(!['check','download','cancel','install'].includes(action))throw Error('无效更新操作。');
    if(action==='check'){checked=true;return controller.check(true);}if(action==='download')return controller.download();if(action==='cancel')return controller.cancel();
    if(installing)return installing;if(controller.snapshot().phase!=='downloaded')return controller.snapshot();
    installing=(async()=>{try{if(!await restart!.prepare())return controller.message('已取消重启，更新包保留，可稍后安装。');const state=controller.install();if(state.phase!=='installing')restart!.resume();return state;}catch(error){return controller.message((error as Error).message);}finally{installing=undefined;}})();return installing;
  });
  ipcMain.on('updates:prepared',(event,token,report)=>{try{trusted(event as Electron.IpcMainInvokeEvent);}catch{return;}restart?.acknowledge(event.sender.id,token,report);});
  const timer=setTimeout(()=>{if(autoCheck()&&!checked)void controller.check();},8000);timer.unref();app.once('will-quit',()=>{clearTimeout(timer);controller.cancel();restart?.resume();app.removeListener('browser-window-created',created);readyWindows.clear();});
  return controller;
}
