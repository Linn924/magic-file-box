import {BrowserWindow,dialog,ipcMain,nativeImage} from 'electron';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {trusted} from './security';
import {ownsPreparedFile,isPreparedSourcePath} from './files';
import {beginOutput} from './activeOutputs';
/** Only an explicit save dialog can write this session's annotated PNG. */
export function setupPdfExport(){
  ipcMain.handle('pdf:export-notes',async(event,id:unknown,name:unknown,data:unknown)=>{
    trusted(event);
    if(typeof id!=='string'||!ownsPreparedFile(event.sender.id,id)||!(data instanceof Uint8Array)||data.length>32*1024*1024)throw Error('导出数据无效或文件已关闭。');
    const buffer=Buffer.from(data);
    if(!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('只允许导出 PNG 图片。');
    const image=nativeImage.createFromBuffer(buffer),size=image.getSize();
    if(image.isEmpty()||size.width>8192||size.height>8192||size.width*size.height>6000000)throw Error('导出图片尺寸无效。');
    const owner=BrowserWindow.fromWebContents(event.sender);if(!owner)throw Error('预览窗口已关闭。');
    const endOutput=beginOutput();try{
    const result=await dialog.showSaveDialog(owner,{title:'导出当前页批注图片',defaultPath:typeof name==='string'?path.basename(name).replace(/[<>:"/\\|?*]/g,'_'):'批注.png',filters:[{name:'PNG 图片',extensions:['png']}],properties:['showOverwriteConfirmation']});
    if(result.canceled||!result.filePath)return 'cancelled';
    if(event.sender.isDestroyed()||!ownsPreparedFile(event.sender.id,id))throw Error('文件已关闭，导出已停止。');
    if(path.extname(result.filePath).toLowerCase()!=='.png'||isPreparedSourcePath(result.filePath))throw Error('请另选 PNG 保存位置，不能覆盖打开的源文件。');
    await writeFile(result.filePath,buffer);
    return 'saved';
    }finally{endOutput();}
  });
}
