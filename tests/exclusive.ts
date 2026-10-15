import {build} from 'esbuild';
import {generateKeyPairSync} from 'node:crypto';
import {mkdirSync,writeFileSync,unlinkSync,copyFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import electron from 'electron';
const run=(command:string,args:string[])=>{const r=spawnSync(command,args,{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('Exclusive test process failed');};
run(process.execPath,['--import','tsx','tests/exclusiveUnit.ts']);
mkdirSync('.test-build',{recursive:true});const fixture=path.resolve('.test-build/exclusive-fixture-'+process.pid+'.json');
copyFileSync('electron-dist/preload.cjs','.test-build/preload.cjs');
const pair=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
writeFileSync(fixture,JSON.stringify(pair),{mode:0o600});
try {
 await build({entryPoints:['tests/exclusive.entry.ts'],outfile:'.test-build/exclusive.cjs',bundle:true,platform:'node',format:'cjs',external:['electron','electron-updater'],target:'node22',tsconfig:'tsconfig.electron.json',plugins:[{
  name:'isolated-test-public-key',setup(plugin){plugin.onLoad({filter:/shared[\\/]exclusiveKey\.ts$/},()=>({loader:'ts',contents:'export const EXCLUSIVE_PUBLIC_KEY = '+JSON.stringify(pair.publicKey)+';'}));}
 }]});
 const profile=path.resolve('work/test-profiles/exclusive-'+process.pid);
 for(const stage of ['activate','verify','cleared'])run(electron as unknown as string,['.test-build/exclusive.cjs',stage,profile,fixture]);
}finally{unlinkSync(fixture);}
