import type {UpdateState} from '../../shared/updates';
import {newerVersion,stableVersion} from '../../shared/updates';
export interface UpdateInfo {version:string;releaseNotes?:unknown;}
export interface UpdateDriver {
  check():Promise<{updateInfo:UpdateInfo}|null>;
  download():Promise<string[]>;
  cancel():void;
  install():void;
  on(event:'download-progress'|'error',listener:(value:any)=>void):unknown;
}
const deadline=<T>(promise:Promise<T>,ms:number)=>new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
function errorText(error:unknown){const code=String((error as {code?:string})?.code||'');if(/CHECKSUM|DIGEST|INVALID.*UPDATE/i.test(code))return '更新包完整性校验失败，请重新下载。';if(/404|NO_PUBLISHED|LATEST_VERSION|CHANNEL_FILE_NOT_FOUND/.test(code))return '更新源尚未提供可用版本，请稍后重试。';return '更新未完成，请检查网络或稍后重试。当前版本仍可正常使用。';}
export class UpdateController {
  private state:UpdateState;
  private task:Promise<UpdateState>|undefined;
  private cancelled=false;
  constructor(private readonly version:string,private readonly driver:UpdateDriver|undefined,private readonly changed:(state:UpdateState)=>void,private readonly timeout=30000){
    this.state={phase:driver?'idle':'unsupported',currentVersion:version,progress:0,transferred:0,total:0,message:driver?'':'开发模式、解压版或非 Windows 环境不执行自动更新；请使用安装版。'};
    driver?.on('download-progress',p=>{if(this.state.phase!=='downloading'||this.cancelled)return;const safe=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,n):0;this.set({progress:Math.min(100,safe(p.percent)),total:safe(p.total),transferred:safe(p.transferred)});});
    driver?.on('error',error=>{if(this.state.phase==='installing')this.set({phase:'downloaded',message:'安装更新未启动，请稍后重试；当前窗口保持打开。'});});
  }
  snapshot(){return {...this.state};}
  private set(value:Partial<UpdateState>){this.state={...this.state,...value};this.changed(this.snapshot());return this.snapshot();}
  async check(force=false){
    if(this.task)return this.task;if(!this.driver||['downloaded','installing'].includes(this.state.phase)||this.state.phase==='available'&&!force)return this.snapshot();
    this.set({phase:'checking',message:'正在检查更新…',retry:undefined,version:undefined,notes:undefined});
    this.task=(async()=>{try{const result=await deadline(Promise.resolve().then(()=>this.driver!.check()),this.timeout),info=result?.updateInfo;if(!info||!stableVersion(info.version))throw Error('invalid version');
      if(!newerVersion(info.version,this.version))return this.set({phase:'idle',message:'当前已是最新版本。'});
      const notes=(typeof info.releaseNotes==='string'?info.releaseNotes:Array.isArray(info.releaseNotes)?info.releaseNotes.map(n=>typeof n.note==='string'?n.note:'').join('\n\n'):'').slice(0,12000);
      return this.set({phase:'available',version:info.version,notes,message:'发现新版本，可下载后重启更新。'});
    }catch(error){return this.set({phase:'error',message:errorText(error),retry:'check'});}finally{this.task=undefined;}})();return this.task;
  }
  async download(){
    if(this.task)return this.task;if(!this.driver||!this.state.version||!(this.state.phase==='available'||this.state.phase==='error'&&this.state.retry==='download'))return this.snapshot();
    this.cancelled=false;this.set({phase:'downloading',progress:0,total:0,transferred:0,message:'正在下载更新…',retry:undefined});
    this.task=(async()=>{try{const files=await Promise.resolve().then(()=>this.cancelled?[]:this.driver!.download());if(this.cancelled)return this.set({phase:'available',message:'已取消下载，当前版本继续使用。'});if(!files.length)throw Error('empty download');return this.set({phase:'downloaded',progress:100,message:'更新已下载，重启后安装。'});
    }catch(error){return this.cancelled?this.set({phase:'available',message:'已取消下载，当前版本继续使用。'}):this.set({phase:'error',message:errorText(error),retry:'download'});}finally{this.task=undefined;}})();return this.task;
  }
  cancel(){if(this.state.phase==='downloading'){this.cancelled=true;this.set({message:'正在取消下载…'});this.driver?.cancel();}return this.snapshot();}
  message(text:string){return this.set({message:text});}
  install(){if(!this.driver||this.state.phase!=='downloaded')return this.snapshot();this.set({phase:'installing',message:'正在重启并安装更新…'});try{this.driver.install();}catch{this.set({phase:'downloaded',message:'安装更新未启动，请稍后重试；当前窗口保持打开。'});}return this.snapshot();}
}
