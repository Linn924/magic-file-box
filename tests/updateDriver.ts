import {EventEmitter} from 'node:events';
import {app} from 'electron';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
export const updateTest={checks:0,downloads:0,installs:0,next:'99.0.0',hold:false,fail:false,installerFails:false,instance:undefined as FakeUpdater|undefined,real:undefined as any};
export class FakeUpdater extends EventEmitter {
  autoDownload=true;autoInstallOnAppQuit=true;autoRunAppAfterInstall=false;allowPrerelease=true;allowDowngrade=true;disableWebInstaller=false;logger:unknown;
  constructor(){super();updateTest.instance=this;}
  async checkForUpdates(){updateTest.checks++;await new Promise(r=>setTimeout(r,25));return {updateInfo:{version:updateTest.next,releaseNotes:'Release notes <script>window.updateXss=true</script>'}};}
  downloadUpdate(token:any){updateTest.downloads++;return token.createPromise((resolve:any,reject:any,onCancel:any)=>{onCancel(()=>reject(Error('cancelled')));this.emit('download-progress',{percent:42,total:1000,transferred:420});if(updateTest.hold)return;setTimeout(()=>updateTest.fail?reject({code:'ERR_CHECKSUM_MISMATCH'}):resolve(['test-only-installer-path']),75);});}
  quitAndInstall(){updateTest.installs++;if(updateTest.installerFails)this.emit('error',Error('installer failed'));}
}
/** Test runner injection only; production has no mock switch or update feed override. */
export function installUpdateTestDriver(){Object.defineProperty(app,'isPackaged',{configurable:true,get:()=>true});const root=path.join(app.getPath('userData'),'mock-install');mkdirSync(root,{recursive:true});writeFileSync(path.join(root,'Uninstall magic file box.exe'),'test marker; never executed');const original=app.getPath.bind(app);app.getPath=(name)=>name==='exe'?path.join(root,'magic file box.exe'):original(name);const module=require('electron-updater/out/NsisUpdater');updateTest.real=module.NsisUpdater;module.NsisUpdater=FakeUpdater;}
