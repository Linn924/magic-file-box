import {BrowserWindow,dialog,ipcMain,clipboard,ClipboardItem} from 'electron';
import {writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {trusted} from './security';
import {ownsPreparedFile,preparedFileName,isPreparedSourceTarget} from './files';
import type {ExcelRegionClipboard} from '../shared/excelEditing';
import {parseTablePaste} from '../src/modules/excel/editModel';
let region:ExcelRegionClipboard|undefined,regionMarker='';
let regionQueue:Promise<unknown>=Promise.resolve();
export function setupExcelCopy(){
  ipcMain.handle('excel:region-clipboard',(event,id:string,operation:string,payload?:ExcelRegionClipboard)=>{const action=async()=>{
    trusted(event);if(!ownsPreparedFile(event.sender.id,id)||!['.xlsx','.xls','.csv','.tsv'].includes(path.extname(preparedFileName(event.sender.id,id)).toLowerCase()))throw Error('文件已关闭或不支持编辑。');
    if(operation==='clear'){if(region?.file===id)region=undefined;return;}
    if(operation==='copy'){if(!payload||payload.file!==id||!Array.isArray(payload.cells)||payload.cells.length>20000||typeof payload.text!=='string'||payload.text.length>1000000||JSON.stringify(payload).length>16*1024*1024)throw Error('选区剪贴板超过当前预算。');const marker='file-preview-'+randomUUID(),escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r\n|\r|\n/g,'<br>'),html='<table><!-- '+marker+' -->'+parseTablePaste(payload.text,20000).map(row=>'<tr>'+row.map(value=>'<td style="white-space:pre-wrap">'+escape(value)+'</td>').join('')+'</tr>').join('')+'</table>';await clipboard.write([new ClipboardItem({'text/plain':new Blob([payload.text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);regionMarker=marker;region=payload;return payload;}
    if(operation==='paste'){if(!region)return;const text=await clipboard.readText();if(text!==region.text){region=undefined;return;}let html='';for(const item of await clipboard.read())if(item.types.includes('text/html'))html+=await ((await item.getType('text/html')) as any).text();if(!region||!html.includes(regionMarker)){region=undefined;return;}if(region.cut&&(region.file!==id||!ownsPreparedFile(event.sender.id,region.file)))throw Error('剪切移动仅支持同一工作簿，请跨文件使用复制。');return region;}
    throw Error('剪贴板操作无效。');
  };const result=regionQueue.then(action);regionQueue=result.catch(()=>{});return result;});
  ipcMain.handle('excel:clipboard',async(event,id:string,operation:string,text?:string)=>{
    trusted(event);if(!ownsPreparedFile(event.sender.id,id)||!['.xlsx','.xls','.csv','.tsv'].includes(path.extname(preparedFileName(event.sender.id,id)).toLowerCase()))throw Error('文件已关闭或不支持编辑。');
    if(operation==='copy'&&typeof text==='string'&&text.length<=1000000){await clipboard.writeText(text);return '';}
    if(operation==='paste'){const value=await clipboard.readText();if(value.length>1000000)throw Error('一次粘贴最多 100 万字符。');return value;}
    throw Error('剪贴板操作无效。');
  });
  ipcMain.handle('excel:save-copy',async(event,id:string,format:string,data:Uint8Array)=>{
    trusted(event);
    if(!ownsPreparedFile(event.sender.id,id)||!['xlsx','xls','csv','tsv'].includes(format)||!(data instanceof Uint8Array)||data.length>100*1024*1024)throw Error('文件已关闭或副本数据无效。');
    const source=preparedFileName(event.sender.id,id);if(!['.xlsx','.xls','.csv','.tsv'].includes(path.extname(source).toLowerCase()))throw Error('此格式只支持预览。');
    if(format==='xlsx'&&(data[0]!==80||data[1]!==75))throw Error('XLSX 副本数据无效。');
    if(format==='xls'&&![208,207,17,224,161,177,26,225].every((byte,index)=>data[index]===byte))throw Error('XLS 副本数据无效。');
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
