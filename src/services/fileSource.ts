import type {PreviewFile} from '@shared/files';
import type {SourceRequest} from '@shared/fileSource';

/** A disposable, window-owned capability; never cache tokens or paths on disk. */
export async function openFileSource(file:PreviewFile,signal:AbortSignal,encoding?:string){
  signal.throwIfAborted();const token=crypto.randomUUID();let closed=false;
  const close=async()=>{if(closed)return;closed=true;signal.removeEventListener('abort',abort);await window.localPreview.closeFileSource(token).catch(()=>{});};
  const abort=()=>{void close();};signal.addEventListener('abort',abort,{once:true});
  try{
    const info=await window.localPreview.openFileSource(file.id,token,encoding);
    signal.throwIfAborted();
    return {info,token,close,page(request:SourceRequest){signal.throwIfAborted();return window.localPreview.readFileSource(token,request);},range(offset:number,length:number){signal.throwIfAborted();return window.localPreview.readFileRange(token,offset,length);}};
  }catch(error){await close();throw error;}
}
export function fileSourceError(error:unknown){
  const text=error instanceof Error?error.message:String(error);
  const message=text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
  return /预算|位置|索引|不完整|引号|修改|不存在|缺少|无效|取消|不属于|不支持|格式|损坏|校验|嵌套|编码|DTD|共享文字|内存/.test(message)?message:'读取失败，请重新加载文件。';
}
