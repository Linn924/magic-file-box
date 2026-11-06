import {build} from 'esbuild';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

export async function generateLoading(){
  const output=path.resolve('dist/native-loading');
  const signature=createHash('sha256').update(readFileSync('shared/startupCard.ts'))
    .update(readFileSync('scripts/generate-loading.entry.ts')).digest('hex');
  const stamp=path.join(output,'signature.txt');
  if(existsSync(stamp)&&readFileSync(stamp,'utf8')===signature&&existsSync(path.join(output,'manifest.json')))return;
  mkdirSync(output,{recursive:true});
  await build({entryPoints:['scripts/generate-loading.entry.ts'],outfile:'.test-build/generate-loading.cjs',
    bundle:true,platform:'node',format:'cjs',external:['electron']});
  const env:NodeJS.ProcessEnv={...process.env,MFB_LOADING_OUTPUT:output};
  delete env.ELECTRON_RUN_AS_NODE;
  const electron=createRequire(import.meta.url)('electron') as string;
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(electron,['.test-build/generate-loading.cjs'],{env,stdio:'inherit',windowsHide:true});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(Error('Loading asset generation failed: '+code)));
  });
  writeFileSync(stamp,signature);
}
