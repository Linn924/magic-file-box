import {BrowserWindow,dialog,ipcMain} from 'electron';
import {trusted} from '../security';
import {ownsPreparedFile,preparedFileName} from './';
const modified=new Map<number,Map<string,string>>();
export function hasModified(owner?:number){return owner===undefined?[...modified.values()].some(files=>files.size>0):!!modified.get(owner)?.size;}
export function forgetModified(owner:number,id?:string){if(id===undefined)modified.delete(owner);else {modified.get(owner)?.delete(id);if(!modified.get(owner)?.size)modified.delete(owner);}}
export function transferModified(source:number,target:number,id:string){const name=modified.get(source)?.get(id);if(name){forgetModified(source,id);let files=modified.get(target);if(!files){files=new Map();modified.set(target,files);}files.set(id,name);}}
export function confirmModified(win:BrowserWindow,owner?:number,id?:string,force=false){
  const names=id?[modified.get(win.webContents.id)?.get(id)||preparedFileName(win.webContents.id,id)]:owner===undefined?[...modified.values()].flatMap(files=>[...files.values()]):[...(modified.get(owner)?.values()||[])];
  if(!force&&!names.filter(Boolean).length)return true;
  const result=dialog.showMessageBoxSync(win,{type:'warning',title:'未保存的修改',message:'是否放弃未另存的修改？',detail:names.filter(Boolean).join('、')+'\n源文件不会被修改；取消后可继续编辑或另存副本。',buttons:['放弃修改','取消'],defaultId:1,cancelId:1,noLink:true});
  return result===0;
}
export function setupModifiedFiles(){
  ipcMain.handle('preview:modified',(event,id:string,dirty:boolean)=>{trusted(event);if(!ownsPreparedFile(event.sender.id,id))return;let files=modified.get(event.sender.id);if(!files){files=new Map();modified.set(event.sender.id,files);}if(dirty)files.set(id,preparedFileName(event.sender.id,id));else forgetModified(event.sender.id,id);});
  ipcMain.handle('preview:confirm-discard',(event,id:string,force=false)=>{trusted(event);if(!ownsPreparedFile(event.sender.id,id))return !modified.get(event.sender.id)?.has(id);const win=BrowserWindow.fromWebContents(event.sender);if(!win)return false;if(!force&&!modified.get(event.sender.id)?.has(id))return true;return confirmModified(win,event.sender.id,id,force);});
}
