import {randomUUID} from 'node:crypto';
import type {RestartReport} from '../../shared/updates';
interface Participant {id:number;send:(channel:string,token:string)=>void;}
/** Freeze and acknowledge every preview before allowing the installer to quit. */
export class RestartCoordinator {
  private current:{token:string;peers:Participant[];waiting:Set<number>;reports:RestartReport[];done:(reports:RestartReport[])=>void}|undefined;
  constructor(private readonly peers:()=>Participant[],private readonly busy:()=>boolean,private readonly dirty:()=>boolean,private readonly confirm:(notes:boolean)=>Promise<boolean>,private readonly timeout=8000){}
  acknowledge(id:number,token:unknown,report:unknown){const p=this.current,r=report as RestartReport;if(!p||token!==p.token||!p.waiting.has(id)||typeof r?.busy!=='boolean'||typeof r?.notes!=='boolean')return;p.waiting.delete(id);p.reports.push(r);if(!p.waiting.size)p.done(p.reports);}
  private samePeers(){const a=this.current?.peers.map(p=>p.id).sort().join(','),b=this.peers().map(p=>p.id).sort().join(',');return a===b;}
  async prepare(){
    if(this.current)throw Error('正在确认更新，请稍候。');if(this.busy())throw Error('正在编辑、移动文件或准备打印，请等待当前任务结束后再更新。');
    const peers=this.peers().map(p=>({...p})),token=randomUUID();if(!peers.length)throw Error('没有可确认更新的窗口，请稍后重试。');
    try{const reports=await new Promise<RestartReport[]>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('有窗口未响应，已取消重启；请稍后重试。')),this.timeout);this.current={token,peers,waiting:new Set(peers.map(p=>p.id)),reports:[],done:reports=>{clearTimeout(timer);resolve(reports);}};for(const p of peers){try{p.send('updates:prepare',token);}catch{clearTimeout(timer);reject(Error('窗口已关闭，已取消重启。'));break;}}});
      if(reports.some(r=>r.busy)||this.busy())throw Error('正在编辑、移动文件或准备打印，请等待当前任务结束后再更新。');
      if(this.dirty())throw Error('有未保存的 Excel 编辑，请先另存副本或恢复源内容，再重启更新。');
      if(!this.samePeers())throw Error('窗口状态已改变，已取消重启；请重新确认。');
      if(!await this.confirm(reports.some(r=>r.notes))){this.resume();return false;}
      if(this.dirty()||this.busy()||!this.samePeers())throw Error('内容或窗口状态已改变，已取消重启；请重新确认。');return true;
    }catch(error){this.resume();throw error;}
  }
  resume(){const p=this.current;this.current=undefined;if(p)for(const peer of p.peers)try{peer.send('updates:resume',p.token);}catch{}}
}
