import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';

export function buildNativeLoading(){
  if(process.platform!=='win32')throw Error('The native loading helper requires a Windows build host.');
  const compiler=path.join(process.env.WINDIR??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  if(!existsSync(compiler))throw Error('Windows .NET Framework C# compiler is unavailable.');
  mkdirSync('electron-dist',{recursive:true});
  const result=spawnSync(compiler,['/nologo','/target:winexe',
    '/out:'+path.resolve('electron-dist/native-loading.exe'),
    '/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll',
    '/win32manifest:'+path.resolve('electron/windows/nativeLoading/loading.manifest'),
    path.resolve('electron/windows/nativeLoading/LoadingHost.cs')],
  {stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Native loading helper compilation failed.');
}
