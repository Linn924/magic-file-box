import type {UpdateDriver} from './controller';
import type {CancellationToken} from 'builder-util-runtime';
import {randomUUID} from 'node:crypto';
import {allowedUpdateUrl} from '@shared/updates';
import type {NsisUpdater} from 'electron-updater';
type UpdaterEvent='download-progress'|'error';
type UpdaterPackage=typeof import('electron-updater');
export function sessionUpdateIdentity(updater:NsisUpdater){
  // Pinned updater 6.x exposes this protected lazy property; never write .updaterId.
  Object.defineProperty(updater,'stagingUserIdPromise',{value:{value:Promise.resolve(randomUUID())}});
  updater.isUserWithinRollout=async()=>true;
}
function createDriver(pkg:UpdaterPackage):UpdateDriver{
  const {CancellationToken}=require('builder-util-runtime') as typeof import('builder-util-runtime');
  class SessionUpdater extends pkg.NsisUpdater {constructor(){super();sessionUpdateIdentity(this);}}
  const updater=new SessionUpdater();
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.autoRunAppAfterInstall=true;
  updater.allowPrerelease=false;updater.allowDowngrade=false;updater.disableWebInstaller=true;
  updater.logger=null;
  if(updater.netSession){updater.netSession.setPermissionRequestHandler((_wc,_permission,reply)=>reply(false));updater.netSession.setPermissionCheckHandler(()=>false);updater.netSession.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,reply)=>reply({cancel:!allowedUpdateUrl(details.url)}));}
  let cancellation:CancellationToken|undefined;
  return {check:()=>updater.checkForUpdates(),download:()=>{cancellation=new CancellationToken();return updater.downloadUpdate(cancellation);},cancel:()=>cancellation?.cancel(),install:()=>updater.quitAndInstall(true,true),on:(event,listener)=>updater.on(event,listener)};
}
export function createUpdateDriver():UpdateDriver{
  let driver:UpdateDriver|undefined,loading:Promise<UpdateDriver>|undefined;
  const listeners:Array<[UpdaterEvent,(value:any)=>void]>=[];
  // electron-updater 依赖较多，等到真正检查或下载更新时再加载，避免占用首次启动时间。
  // 主进程产物是 CommonJS，使用 require 以便安装包从 asar 内读取依赖。
  function load(){
    return loading??=Promise.resolve().then(()=>{
      const pkg=require('electron-updater') as UpdaterPackage;
      const created=createDriver(pkg);
      for(const [event,listener] of listeners)created.on(event,listener);
      driver=created;
      return created;
    });
  }
  return {
    check:()=>load().then(created=>created.check()),
    download:()=>load().then(created=>created.download()),
    cancel:()=>driver?.cancel(),
    install:()=>{load().then(created=>created.install()).catch(()=>{});},
    on:(event,listener)=>{listeners.push([event,listener]);driver?.on(event,listener);},
  };
}
