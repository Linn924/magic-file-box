import {ipcMain,shell,clipboard,type WebContents} from 'electron';
import path from 'node:path';
import {stat,open as openFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {trusted} from './security';
import {preparedFilePath,ownsPreparedFile} from './files';
import {extensions} from '../shared/contracts';
export function resolveMarkdownLink(source:string,href:string){
  if(typeof href!=='string'||href.length>8192||/[\u0000-\u001f]/.test(href))throw Error('链接地址无效。');href=href.trim();
  if(/^https?:\/\//i.test(href)||href.startsWith('//')){const url=new URL(href.startsWith('//')?'https:'+href:href);return {external:url.href};}
  let target:string,anchor='';const at=href.indexOf('#');try{anchor=at>=0?decodeURIComponent(href.slice(at+1)):'';}catch{throw Error('链接位置编码无效。');}const raw=at>=0?href.slice(0,at):href;
  if(/^file:/i.test(raw)){const url=new URL(raw);if(url.hostname&&url.hostname!=='localhost')throw Error('不支持网络文件链接。');if(url.search)throw Error('本地链接不支持查询参数。');target=fileURLToPath(url);}
  else{if(/^[a-z][a-z0-9+.-]*:/i.test(raw)&&! /^[a-z]:[\\/]/i.test(raw))throw Error('不支持此链接协议。');if(raw.includes('?'))throw Error('本地链接不支持查询参数。');try{target=raw?path.resolve(path.dirname(source),decodeURIComponent(raw)):source;}catch{throw Error('链接路径编码无效。');}}
  if(/[\u0000-\u001f]/.test(target+anchor)||target.startsWith('\\\\'))throw Error('不支持网络或设备文件链接。');if(!extensions.includes(path.extname(target).slice(1).toLowerCase()))throw Error('工具暂不支持此链接文件的格式。');return {path:target,anchor};
}
function markdownSource(owner:number,id:string){const source=preparedFilePath(owner,id);if(path.extname(source).toLowerCase()!=='.md')throw Error('仅 Markdown 文件可以使用此功能。');return source;}
export function setupMarkdownLinks(open:(target:string,anchor:string,sender:WebContents,id:string)=>Promise<void>){
  ipcMain.handle('markdown:follow',async(event,id:string,href:string)=>{trusted(event);const source=markdownSource(event.sender.id,id);const link=resolveMarkdownLink(source,href);if(link.external){await shell.openExternal(link.external);return;}try{if(!(await stat(link.path!)).isFile())throw Error();}catch{throw Error('链接文件不存在、不可读取或不是普通文件。');}if(!ownsPreparedFile(event.sender.id,id))throw Error('来源文件已关闭，跳转已取消。');await open(link.path!,link.anchor||'',event.sender,id);});
  ipcMain.handle('markdown:copy',(event,id:string,text:string)=>{trusted(event);markdownSource(event.sender.id,id);if(typeof text!=='string'||text.length>5*1024*1024)throw Error('复制内容过大。');clipboard.writeText(text);});
  ipcMain.handle('markdown:image',async(event,id:string,href:string)=>{
    trusted(event);const source=markdownSource(event.sender.id,id),link=resolveMarkdownLink(source,href);
    if(link.external)throw Error('只显示本机图片，不自动加载网络图片。');
    const mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',svg:'image/svg+xml'};
    const type=mime[path.extname(link.path!).slice(1).toLowerCase()];if(!type)throw Error('链接不是支持的图片。');
    const handle=await openFile(link.path!,'r').catch(()=>{throw Error('图片不存在或无法读取。');});try{const info=await handle.stat(),limit=16*1024*1024;if(!info.isFile()||info.size>limit)throw Error('本地图片须为普通文件且不超过 16 MB。');const buffer=Buffer.alloc(info.size+1);let size=0;while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,size);if(!bytesRead)break;size+=bytesRead;}if(size!==info.size)throw Error('图片读取期间已改变，请重新打开。');if(!ownsPreparedFile(event.sender.id,id))throw Error('来源文件已关闭。');return {data:buffer.subarray(0,size),mime:type};}finally{await handle.close();}
  });
}
