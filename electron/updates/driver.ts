import updaterPackage,{type NsisUpdater} from 'electron-updater';
import {CancellationToken} from 'builder-util-runtime';
import type {UpdateDriver} from './controller';
import {randomUUID} from 'node:crypto';
import {allowedUpdateUrl} from '@shared/updates';
export function sessionUpdateIdentity(updater:NsisUpdater){
  // Pinned updater 6.x exposes this protected lazy property; never write .updaterId.
  Object.defineProperty(updater,'stagingUserIdPromise',{value:{value:Promise.resolve(randomUUID())}});
  updater.isUserWithinRollout=async()=>true;
}
class SessionUpdater extends updaterPackage.NsisUpdater {constructor(){super();sessionUpdateIdentity(this);}}
export function createUpdateDriver():UpdateDriver{
  const updater=new SessionUpdater();
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.autoRunAppAfterInstall=true;
  updater.allowPrerelease=false;updater.allowDowngrade=false;updater.disableWebInstaller=true;
  updater.logger=null;
  if(updater.netSession){updater.netSession.setPermissionRequestHandler((_wc,_permission,reply)=>reply(false));updater.netSession.setPermissionCheckHandler(()=>false);updater.netSession.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,reply)=>reply({cancel:!allowedUpdateUrl(details.url)}));}
  let cancellation:CancellationToken|undefined;
  return {check:()=>updater.checkForUpdates(),download:()=>{cancellation=new CancellationToken();return updater.downloadUpdate(cancellation);},cancel:()=>cancellation?.cancel(),install:()=>updater.quitAndInstall(true,true),on:(event,listener)=>updater.on(event,listener)};
}
