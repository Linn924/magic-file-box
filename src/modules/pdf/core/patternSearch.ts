import type {SearchOptions,TextMatch} from './searchIndex';
/** One worker per search; each page has a deadline, abort terminates regex work. */
export class PatternSearch {
  private worker:Worker|undefined;
  async matches(text:string,query:string,options:SearchOptions,limit:number,signal:AbortSignal):Promise<TextMatch[]> {
    if(signal.aborted)throw new DOMException('搜索已取消','AbortError');
    const worker=this.worker??=new Worker(new URL('../workers/searchWorker.ts',import.meta.url),{type:'module'});
    return new Promise((resolve,reject)=>{
      const finish=(error?:Error,value?:TextMatch[])=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.onmessage=null;worker.onerror=null;if(error){this.close();reject(error);}else resolve(value!);};
      const abort=()=>finish(new DOMException('搜索已取消','AbortError'));
      const timer=setTimeout(()=>finish(Error('搜索表达式处理超时，请简化表达式。')),1000);
      signal.addEventListener('abort',abort,{once:true});
      worker.onmessage=event=>event.data.error?finish(Error(event.data.error)):finish(undefined,event.data.matches);
      worker.onerror=()=>finish(Error('无法执行模式搜索。'));
      worker.postMessage({text,query,options,limit});
    });
  }
  close(){this.worker?.terminate();this.worker=undefined;}
}
