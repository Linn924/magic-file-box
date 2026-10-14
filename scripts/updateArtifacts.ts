import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {load,JSON_SCHEMA} from 'js-yaml';
import {stableVersion} from '@shared/updates';
const parse=async(file:string)=>{if((await stat(file)).size>1024*1024)throw Error('更新元数据超过 1 MB。');return load(await readFile(file,'utf8'),{schema:JSON_SCHEMA}) as any;};
export async function verifyUpdateArtifacts(root:string,version:string){
  if(!stableVersion(version))throw Error('更新版本必须为正式三段版本号。');
  const manifest=await parse(path.join(root,'latest.yml')),name=`FilePreview-Setup-${version}-x64.exe`;
  if(manifest?.version!==version||!Array.isArray(manifest.files)||manifest.files.length!==1||manifest.packages)throw Error('更新版本或安装包类型不匹配。');
  const file=manifest.files[0];if(file?.url!==name||manifest.path!==undefined&&manifest.path!==name)throw Error('更新清单必须指向本次完整 NSIS 安装包。');
  const bytes=await readFile(path.join(root,name)),hash=createHash('sha512').update(bytes).digest('base64');
  if(file.size!==bytes.length||file.sha512!==hash||manifest.sha512!==undefined&&manifest.sha512!==hash)throw Error('更新包大小或 SHA512 不匹配。');
  if(!(await stat(path.join(root,name+'.blockmap'))).size)throw Error('更新包缺少 blockmap。');
  const config=await parse(path.join(root,'win-unpacked/resources/app-update.yml'));
  if(config?.provider!=='github'||config.owner!=='Linn924'||config.repo!=='filePreview'||config.publisherName!==undefined)throw Error('内置更新源不匹配或包含签名发布者配置。');
  return name;
}
