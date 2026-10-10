import {BrowserWindow,dialog,ipcMain} from 'electron';
import {writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {trusted} from './security';
import {ownsPreparedFile,preparedFileName,isPreparedSourceTarget} from './files';
export function setupExcelCopy(){
  ipcMain.handle('excel:save-copy',async(event,id:string,format:string,data:Uint8Array)=>{
    trusted(event);
    if(!ownsPreparedFile(event.sender.id,id)||!['xlsx','csv','tsv'].includes(format)||!(data instanceof Uint8Array)||data.length>100*1024*1024)throw Error('文件已关闭或副本数据无效。');
    const source=preparedFileName(event.sender.id,id);if(!['.xlsx','.csv','.tsv'].includes(path.extname(source).toLowerCase()))throw Error('此格式只支持预览。');
    if(format==='xlsx'&&(data[0]!==80||data[1]!==75))throw Error('XLSX 副本数据无效。');
    const owner=BrowserWindow.fromWebContents(event.sender);if(!owner)throw Error('预览窗口已关闭。');
    const result=await dialog.showSaveDialog(owner,{title:'另存表格副本（不覆盖源文件）',defaultPath:path.basename(source,path.extname(source))+'-副本.'+format,filters:[{name:format.toUpperCase(),extensions:[format]}],properties:['showOverwriteConfirmation']});
    if(result.canceled||!result.filePath)return 'cancelled';
    if(event.sender.isDestroyed()||!ownsPreparedFile(event.sender.id,id))throw Error('文件已关闭，保存已停止。');
    if(path.extname(result.filePath).toLowerCase()!=='.'+format)throw Error('请选择与副本格式一致的扩展名。');
    if(await isPreparedSourceTarget(result.filePath))throw Error('不能覆盖正在打开的源文件，请另选保存位置。');
    const temporary=path.join(path.dirname(result.filePath),'.file-preview-'+randomUUID()+'.tmp');
    try{await writeFile(temporary,data,{flag:'wx'});if(event.sender.isDestroyed()||!ownsPreparedFile(event.sender.id,id))throw Error('文件已关闭，保存已停止。');await rename(temporary,result.filePath);return 'saved';}
    finally{await unlink(temporary).catch(()=>{});}
  });
}
