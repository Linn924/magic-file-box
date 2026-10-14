import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {UpdateController,type UpdateDriver} from '../electron/updates/controller';
import {RestartCoordinator} from '../electron/updates/restart';
import {newerVersion,stableVersion,allowedUpdateUrl} from '@shared/updates';
import {verifyUpdateArtifacts} from '../scripts/updateArtifacts';
class Driver extends EventEmitter implements UpdateDriver {
  checks=0;downloads=0;installed=0;failed=false;next='3.3.7';cancelled=false;
  check(){this.checks++;return Promise.resolve({updateInfo:{version:this.next,releaseNotes:'<script>plain text</script>'}});}
  async download(){this.downloads++;await new Promise(r=>setTimeout(r,10));if(this.cancelled)throw Error('cancelled');if(this.failed)throw {code:'ERR_CHECKSUM_MISMATCH',message:'secret path'};return ['secret installer path'];}
  cancel(){this.cancelled=true;}
  install(){this.installed++;}
}
assert.equal(newerVersion('3.3.10','3.3.9'),true);assert.equal(newerVersion('3.3.5','3.3.6'),false);assert.equal(stableVersion('3.3.7-beta'),false);assert.equal(stableVersion('01.2.3'),false);
assert.equal(allowedUpdateUrl('https://github.com/Linn924/filePreview/releases.atom'),true);assert.equal(allowedUpdateUrl('https://release-assets.githubusercontent.com/file'),true);for(const url of ['http://github.com/x','https://github.com.evil.test/x','https://evil.test/x','file:///C:/test.exe','https://user:pass@github.com/x','https://github.com:8080/x'])assert.equal(allowedUpdateUrl(url),false);
const d=new Driver(),states:unknown[]=[],c=new UpdateController('3.3.6',d,s=>states.push(s));await Promise.all([c.check(),c.check()]);assert.equal(d.checks,1);assert.equal(c.snapshot().phase,'available');
const pending=c.download();d.emit('download-progress',{percent:999,total:NaN,transferred:-3});assert.equal(c.snapshot().progress,100);assert.equal(c.snapshot().total,0);c.cancel();await pending;assert.equal(c.snapshot().phase,'available');assert.equal(d.installed,0);
d.cancelled=false;d.failed=true;await c.download();assert.match(c.snapshot().message,/完整性/);assert.ok(!JSON.stringify(c.snapshot()).includes('secret'));assert.equal(c.snapshot().retry,'download');d.failed=false;await c.download();assert.equal(c.snapshot().phase,'downloaded');c.install();assert.equal(d.installed,1);d.emit('error',Error('secret'));assert.equal(c.snapshot().phase,'downloaded');
const old=new Driver();old.next='3.3.5';await new UpdateController('3.3.6',old,()=>{}).check();assert.equal(old.checks,1);
const unsupported=new UpdateController('3.3.6',undefined,()=>{});assert.equal((await unsupported.check()).phase,'unsupported');
const slow=new Driver();slow.check=()=>new Promise(()=>{});const timed=new UpdateController('3.3.6',slow,()=>{},20);await timed.check();assert.equal(timed.snapshot().phase,'error');assert.ok(!timed.snapshot().message.includes('timeout'));
let dirty=false,busy=false,accept=true,notes=false;const sent:string[]=[],peers:Array<{id:number;send:(channel:string,token:string)=>void}>=[];
const restart=new RestartCoordinator(()=>peers,()=>busy,()=>dirty,async found=>{notes=found;return accept;},30);
peers.push({id:1,send:(channel,token)=>{sent.push(channel);if(channel==='updates:prepare'){restart.acknowledge(9,token,{busy:false,notes:false});restart.acknowledge(1,'wrong',{busy:false,notes:false});restart.acknowledge(1,token,{busy:false,notes:true});}}});
dirty=true;await assert.rejects(restart.prepare(),/未保存/);assert.equal(sent.at(-1),'updates:resume');dirty=false;accept=false;assert.equal(await restart.prepare(),false);assert.equal(notes,true);accept=true;assert.equal(await restart.prepare(),true);restart.resume();busy=true;await assert.rejects(restart.prepare(),/正在编辑/);busy=false;
const hung=new RestartCoordinator(()=>[{id:3,send:channel=>sent.push(channel)}],()=>false,()=>false,async()=>true,20);await assert.rejects(hung.prepare(),/未响应/);assert.equal(sent.at(-1),'updates:resume');
const roster=[{id:1,send:(_channel:string,_token:string)=>{}}];let rosterGuard:RestartCoordinator;roster[0].send=(channel,token)=>{if(channel==='updates:prepare')rosterGuard.acknowledge(1,token,{busy:false,notes:false});};rosterGuard=new RestartCoordinator(()=>roster,()=>false,()=>false,async()=>{roster.push({id:2,send:()=>{}});return true;});await assert.rejects(rosterGuard.prepare(),/窗口状态/);
await mkdir('.test-build',{recursive:true});const root=await mkdtemp(path.resolve('.test-build/update-artifacts-'));
try{const bytes=Buffer.from('fixture installer payload'),hash=createHash('sha512').update(bytes).digest('base64'),name='FilePreview-Setup-3.3.6-x64.exe';await mkdir(path.join(root,'win-unpacked/resources'),{recursive:true});await writeFile(path.join(root,'win-unpacked/resources/app-update.yml'),'provider: github\nowner: Linn924\nrepo: filePreview\n');await writeFile(path.join(root,name),bytes);await writeFile(path.join(root,name+'.blockmap'),'block');const manifest={version:'3.3.6',files:[{url:name,size:bytes.length,sha512:hash}]};await writeFile(path.join(root,'latest.yml'),JSON.stringify(manifest));assert.equal(await verifyUpdateArtifacts(root,'3.3.6'),name);await writeFile(path.join(root,name),'corrupt');await assert.rejects(verifyUpdateArtifacts(root,'3.3.6'),/SHA512/);await writeFile(path.join(root,name),bytes);manifest.files[0].url='../outside.exe';await writeFile(path.join(root,'latest.yml'),JSON.stringify(manifest));await assert.rejects(verifyUpdateArtifacts(root,'3.3.6'),/清单/);}finally{assert.ok(root.startsWith(path.resolve('.test-build')+path.sep));await rm(root,{recursive:true,force:true});}
console.log('PASS update version, single flight, cancellation, checksum errors, progress bounds, restart acknowledgements/dirty/roster/timeout and release metadata');
